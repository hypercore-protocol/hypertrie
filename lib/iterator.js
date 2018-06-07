const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')

module.exports = Iterator

function Iterator (db, prefix, opts) {
  Nanoiterator.call(this)

  this._prefix = Node.normalizeKey(prefix || '')
  this._recursive = !opts || opts.recursive !== false
  this._start = 0
  this._end = 0
  this._db = db
  this._stack = []
  this._callback = null
  this._pending = 0
  this._error = null
  this._gt = !!(opts && opts.gt)
}

inherits(Iterator, Nanoiterator)

Iterator.prototype._open = function (cb) {
  const self = this
  const prefix = this._db.get(this._prefix, {prefix: true}, onnode)

  function onnode (err, node) {
    if (err) return cb(err)
    if (node) self._stack.push({i: prefix._length, node})
    self._start = prefix._length
    if (self._recursive) self._end = Infinity
    else self._end = prefix._length + 32
    cb(null)
  }
}

Iterator.prototype._next = function (cb) {
  var j

  while (this._stack.length) {
    const top = this._stack.pop()
    const len = Math.min(top.node.length, this._end)
    const i = top.i++
    if (i >= len) return cb(null, top.node)

    const bucket = top.node.trie[i] || []

    // 3, 2, 1, 0, 4
    for (j = 3; j >= 0; j--) {
      if (bucket[j]) this._push(i + 1, bucket[j])
    }
    if (!this._gt || i !== this._start) {
      for (j = 4; j < bucket.length; j++) {
        if (bucket[j]) this._push(i + 1, bucket[j])
      }
    }

    this._stack.push(top)
    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
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
