const Put = require('./put')

module.exports = Delete

function Delete (db, key, opts, cb) {
  this._db = db
  this._key = key
  this._callback = cb
  this._release = null
  this._put = null
  this._get = null
  this._batch = (opts && opts.batch) || null

  this._lock()
}

Delete.prototype._lock = function () {
  if (this._batch) return this._start()
  const self = this

  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Delete.prototype._start = function () {
  const self = this
  const batch = this._batch
  var closest = null
  this._get = this._db.get(this._key, {onnode, batch}, done)

  function onnode (node) {
    if (node.key !== self._get._node.key) closest = node
  }

  function done (err, node) {
    if (err) return self._finalize(err)
    if (!node) return self._finalize(null)
    if (closest) self._splice(closest, node)
    else self._pop()
  }
}

Delete.prototype._finalize = function (err, node) {
  if (!this._release) this._callback(err, node)
  else this._release(this._callback, err, node)
}

Delete.prototype._splice = function (closest, node) {
  const self = this
  this._put = new Put(this._db, closest.key, closest.value, this._batch, node.seq, done)

  function done (err, node) {
    self._finalize(err, node)
  }
}

Delete.prototype._pop = function () {
  const self = this

  if (this._db.feed.length < 3) return console.log('empty')

  this._db.getBySeq(this._db.feed.length - 2, function (err, node) {
    if (err) return self._finalize(err)
    console.log(node, '<-- node')
  })
}
