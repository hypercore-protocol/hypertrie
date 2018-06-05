const Put = require('./put')

module.exports = Batch

function Batch (db, head, ops, cb) {
  this._db = db
  this._ops = ops
  this._callback = cb
  this._head = head
  this._nodes = []
  this._offset = 0
  this._put = null
  this._start()
}

Batch.prototype.then = function (resolve, reject) {
  this._callback = function (err, val) {
    if (err) reject(err)
    else resolve(val)
  }
}

Batch.prototype.get = function (seq) {
  if (seq < this._offset) return null
  return this._nodes[seq - this._offset]
}

Batch.prototype.append = function (node) {
  node.seq = this._offset + this._nodes.length
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
    self._release(self._callback, err)
  }
}

Batch.prototype._start = function () {
  const self = this
  this._db.lock(function (release) {
    self._release = release
    self._db.ready(function () {
      self._offset = self._db.feed.length
      if (self._head) return self._update()
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

  loop(null)

  function loop (err) {
    if (err) return self._finalize(err)
    if (i === self._ops.length) return self._finalize(null)
    const {key, value} = self._ops[i++]
    self._put = new Put(self._db, self._head, key, value, self, loop)
  }
}
