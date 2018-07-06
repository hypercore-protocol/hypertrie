const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')

const SORT_ORDER = [4, 0, 1, 2, 3].reverse()
const REVERSE_SORT_ORDER = SORT_ORDER.slice(0).reverse()

module.exports = Iterator

function Iterator (db, prefix, opts) {
  Nanoiterator.call(this)

  this._prefix = Node.normalizeKey(prefix || '')
  this._recursive = !opts || opts.recursive !== false
  this._order = (opts && opts.reverse) ? REVERSE_SORT_ORDER : SORT_ORDER
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

    for (j = 0; j < this._order.length; j++) {
      var val = this._order[j]
      if (val !== 4 || !this._gt || i !== this._start) {
        if (top.node.path(i) === val) this._stack.push(top)
        for (; val < bucket.length; val += 5) this._push(i + 1, bucket[val])
      }
    }

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

Iterator.prototype._pushCollides = function (i, bucket, val) {
  console.log('hi!')
}

Iterator.prototype._push = function (i, seq) {
  if (!seq) return

  const self = this
  const top = {i, node: null}

  this._pending++
  this._stack.push(top)
  this._db.getBySeq(seq, function (err, node) {
    if (node) top.node = node
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
