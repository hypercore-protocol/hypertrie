const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const varint = require('varint')
const Node = require('./node')
const { BATCH_SIZE } = require('./extension')

const SORT_ORDER = [4, 0, 1, 2, 3].reverse()
const REVERSE_SORT_ORDER = SORT_ORDER.slice(0).reverse()

module.exports = Iterator

function Iterator (db, prefix, opts) {
  Nanoiterator.call(this)

  if (opts && opts.flags) {
    opts.recursive = opts.flags & 1
    opts.reverse = opts.flags & 2
    opts.gt = opts.flags & 4
    opts.hidden = opts.flags & 8
  }

  this._checkpoint = (opts && opts.checkpoint) || null
  this._prefix = Node.normalizeKey(prefix || '')
  this._recursive = !opts || opts.recursive !== false
  this._order = (opts && opts.reverse) ? REVERSE_SORT_ORDER : SORT_ORDER
  this._random = !!(opts && opts.random)
  this._extension = (opts && opts.extension === false) ? null : db._extension
  this._extensionState = this._extension ? { missing: 0, head: 0, checkpoint: false } : null
  this._onseq = (opts && opts.onseq) || null
  this._start = 0
  this._end = 0
  this._db = db
  this._stack = []
  this._callback = null
  this._pending = 0
  this._error = null
  this._gt = !!(opts && opts.gt)
  this._needsSort = []
  this._options = opts ? { extension: opts.extension, wait: opts.wait, timeout: opts.timeout, hidden: !!opts.hidden, onseq: opts.onseq, onwait: null } : { onwait: null }
  this._flags = (this._recursive ? 1 : 0) | (this._order === REVERSE_SORT_ORDER ? 2 : 0) | (this._gt ? 4 : 0) | ((this._options && this._options.hidden) ? 8 : 0)
  if (this._extensionState) this._options.onwait = this._sendExt.bind(this)
}

inherits(Iterator, Nanoiterator)

Iterator.prototype._open = function (cb) {
  const self = this
  const opts = Object.assign(this._options || {}, { prefix: true, extension: false, onheadseq })
  const prefix = this._db.get(this._prefix, opts, onnode)

  function onnode (err, node) {
    if (err) return cb(err)
    if (node && !self._checkpoint) self._stack.push({i: prefix._length, seq: node.seq, node})
    self._start = prefix._length
    if (self._recursive) self._end = Infinity
    else self._end = prefix._length + 32
    if (self._extensionState) self._extensionState.checkpoint = true
    if (self._checkpoint) self._openCheckpoint(cb)
    else cb(null)
  }

  function onheadseq (seq) {
    const ext = self._extensionState
    if (ext && !ext.head) ext.head = seq
  }
}

Iterator.prototype._sendExt = function () {
  if (this._extensionState.missing > 0 || !this._extensionState.head) return
  this._extensionState.missing = BATCH_SIZE
  this._extension.iterator(this._extensionState.head, this._prefix, this._flags, this._extensionState.checkpoint ? this.checkpoint() : null)
}

Iterator.prototype._openCheckpoint = function (cb) {
  var ptr = 0

  this._callback = cb

  while (ptr < this._checkpoint.length) {
    const i = varint.decode(this._checkpoint, ptr)
    ptr += varint.decode.bytes
    const seq = varint.decode(this._checkpoint, ptr)
    ptr += varint.decode.bytes
    this._push(i, seq)
  }

  if (!this._pending) {
    this._callback = null
    cb(null)
  }
}

Iterator.prototype.checkpoint = function () {
  const buf = Buffer.alloc(this._stack.length * 8 * 2)
  var ptr = 0

  for (var i = 0; i < this._stack.length; i++) {
    const s = this._stack[i]
    varint.encode(s.i, buf, ptr)
    ptr += varint.encode.bytes
    varint.encode(s.seq, buf, ptr)
    ptr += varint.encode.bytes
  }

  return buf.slice(0, ptr)
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
  const top = {i, seq, node: null}

  this._pending++
  this._stack.push(top)

  if (this._onseq) this._onseq(seq)
  if (this._extensionState && this._extensionState.missing > 0) this._extensionState.missing--

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
  if (!this.opened) return callback(null)
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
