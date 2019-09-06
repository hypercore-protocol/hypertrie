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
  this._random = !!(opts && opts.random)
  this._start = 0
  this._end = 0
  this._db = db
  this._stack = []
  this._callback = null
  this._pending = 0
  this._error = null
  this._gt = !!(opts && opts.gt)
  this._needsSort = []
  this._options = opts ? { wait: opts.wait, timeout: opts.timeout, hidden: !!opts.hidden } : null
}

inherits(Iterator, Nanoiterator)

Iterator.prototype._open = function (cb) {
  const self = this
  const opts = Object.assign({ prefix: true }, this._options)
  const prefix = this._db.get(this._prefix, opts, onnode)

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

    if (i >= len) return cb(null, top.node.final())

    const bucket = top.node.trie[i] || []
    const order = this._random ? randomOrder() : this._order

    for (j = 0; j < order.length; j++) {
      var val = order[j]
      if (val !== 4 || !this._gt || i !== this._start) {
        const len = this._stack.length
        if (top.node.path(i) === val) this._stack.push(top)
        for (; val < bucket.length; val += 5) {
          const seq = bucket[val]
          if (seq) this._push(i + 1, seq)
        }
        if (this._stack.length - len > 1) {
          this._needsSort.push(len, this._stack.length)
        }
      }
    }

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

Iterator.prototype._push = function (i, seq) {
  const self = this
  const top = {i, node: null}

  this._pending++
  this._stack.push(top)
  this._db.getBySeq(seq, this._options, onnode)

  function onnode (err, node) {
    if (node) top.node = node
    else if (err) self._error = err
    if (!--self._pending) self._continue()
  }
}

Iterator.prototype._sort = function () {
  // only ran when there are potential collisions to make sure
  // the iterator sorts consistently
  while (this._needsSort.length) {
    const end = this._needsSort.pop()
    const start = this._needsSort.pop()
    sort(this._stack, start, end)
  }
}

Iterator.prototype._continue = function () {
  const callback = this._callback
  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)
  if (this._needsSort.length) this._sort()
  this._next(callback)
}

function sort (list, from, to) {
  // only ran on short lists so the simple o(n^2) algo is fine
  for (var i = from + 1; i < to; i++) {
    for (var j = i; j > from; j--) {
      const a = list[j]
      const b = list[j - 1]
      if (a.node.key <= b.node.key) break
      list[j] = b
      list[j - 1] = a
    }
  }
}

function randomOrder () {
  const order = [0, 1, 2, 3, 4]
  for (let i = 0; i < order.length - 1; i++) {
    const n = i + Math.floor(Math.random() * (order.length - i))
    const tmp = order[i]
    order[i] = order[n]
    order[n] = tmp
  }
  return order
}
