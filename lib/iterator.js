const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')

module.exports = Iterator

function Iterator (db, prefix, opts) {
  Nanoiterator.call(this)

  this._prefix = Node.normalizeKey(prefix || '')
  this._recursive = !opts || opts.recursive !== false
  this._recursiveLen = 0
  this._db = db
  this._stack = []
  this._callback = null
  this._pending = 0
  this._error = null
}

inherits(Iterator, Nanoiterator)

Iterator.prototype._open = function (cb) {
  const self = this
  const prefix = this._db.get(this._prefix, {prefix: true}, onnode)

  function onnode (err, node) {
    if (err) return cb(err)
    if (node) self._stack.push({i: prefix._length, node})
    if (self._recursive) self._recursiveLen = Infinity
    else self._recursiveLen = prefix._length + 32
    cb(null)
  }
}

Iterator.prototype._next = function (cb) {
  while (true) {
    const top = this._stack.pop()
    if (!top) return cb(null, null)

    const len = Math.min(top.node.length, this._recursiveLen)
    if (top.i >= len) return cb(null, top.node)

    const bucket = top.node.trie[top.i++] || []

    for (var i = 0; i < bucket.length; i++) {
      if (!bucket[i]) continue
      this._push(top.i, bucket[i])
    }

    this._stack.push(top)
    if (!this._pending) continue
    this._callback = cb
    return
  }
}

Iterator.prototype._push = function (i, seq) {
  const self = this

  this._pending++
  this._db.getBySeq(seq, function (err, node) {
    if (node) self._stack.push({i, node})
    else if (err) self._error = err
    if (!--self._pending) self._continue()
  })
}

Iterator.prototype._continue = function () {
  const callback = this._callback
  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)
  this._next(callback)
}
