const Put = require('./put')
const Delete = require('./del')

module.exports = Batch

function Batch (db, ops, cb) {
  this._db = db
  this._ops = ops
  this._callback = cb
  this._head = null
  this._nodes = []
  this._offset = 0
  this._op = null
  this._start()
}

Batch.prototype.get = function (seq) {
  if (seq < this._offset) return null
  return this._nodes[seq - this._offset]
}

Batch.prototype.head = function () {
  return this._head
}

Batch.prototype.append = function (node) {
  node.seq = this._offset + this._nodes.length
  node.preencode()
  this._nodes.push(node)
}

Batch.prototype._finalize = function (err) {
  const self = this
  if (err) return done(err)

  const buffers = new Array(this._nodes.length)
  for (var i = 0; i < buffers.length; i++) {
    buffers[i] = this._nodes[i].encode()
  }

  this._db.feed.append(buffers, done)

  function done (err) {
    self._release(self._callback, err, self._nodes)
  }
}

Batch.prototype._start = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._db.ready(function () {
      self._offset = self._db.feed.length
      self._db.head(function (err, head) {
        if (err) return self._finalize(err)
        self._head = head
        self._update()
      })
    })
  })
}

Batch.prototype._update = function () {
  var i = 0
  const self = this

  loop(null, null)

  function loop (err, head) {
    if (err) return self._finalize(err)
    if (i === self._ops.length) return self._finalize(null)
    if (head) self._head = head

    const {type, key, value, hidden, flags} = self._ops[i++]
    if (type === 'del') self._op = new Delete(self._db, key, { batch: self, hidden }, loop)
    else self._op = new Put(self._db, key, value === undefined ? null : value, { batch: self, del: 0, hidden, flags }, loop)
  }
}
