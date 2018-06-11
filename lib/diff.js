const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')

module.exports = Diff

function Diff (db, checkout, prefix, opts) {
  Nanoiterator.call(this)

  this._db = db
  this._prefix = prefix || ''
  this._checkout = checkout
  this._stack = []
  this._pending = 0
  this._error = null
  this._callback = null
  this._onnode = (opts && opts.onnode) || null
}

inherits(Diff, Nanoiterator)

Diff.prototype._open = function (cb) {
  const self = this
  const opts = {onnode: this._onnode, prefix: true}
  const get = this._db.get(this._prefix, opts, function (err, a) {
    if (err) return cb(err)
    self._checkout.get(self._prefix, opts, function (err, b) {
      if (err) return cb(err)
      self._stack.push({i: get._length, left: a, right: b})
      cb(null)
    })
  })
}

Diff.prototype._get = function (seq, top, left) {
  const self = this
  this._pending++
  this._db.getBySeq(seq, function (err, node) {
    if (self._onnode && node) self._onnode(node)
    if (node) set(top, left, node)
    else if (err) self._error = err
    if (!--self._pending) self._finalize()
  })
}

Diff.prototype._finalize = function () {
  const callback = this._callback
  if (!callback) return
  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)
  this._next(callback)
}

Diff.prototype._push = function (seq, top, node, left) {
  if (node && seq === node.seq) {
    set(top, left, node)
    return true
  }

  if (seq) {
    this._get(seq, top, left)
    return true
  }

  return false
}

Diff.prototype._next = function (cb) {
  if (this._pending) {
    this._callback = cb
    return
  }

  if (this._error) return cb(this._error)

  while (this._stack.length) {
    const {i, left, right} = this._stack.pop()

    if (seq(left) === seq(right)) continue

    const doneLeft = done(left, i)
    const doneRight = done(right, i)

    // TODO: collisions, yada yada

    if (doneLeft && doneRight) return call(cb, left, right)

    const leftVal = left ? left.path(i) : 5
    const rightVal = right ? right.path(i) : 6
    const leftBucket = trie(left, i)
    const rightBucket = trie(right, i)

    for (var j = 0; j < 5; j++) {
      const leftSeq = leftVal === j ? left.seq : (leftBucket[j] || 0)
      const rightSeq = rightVal === j ? right.seq : (rightBucket[j] || 0)

      if (leftSeq === rightSeq) continue

      const top = {i: i + 1, left: null, right: null}
      const pushLeft = !doneLeft && this._push(leftSeq, top, left, true)
      const pushRight = !doneRight && this._push(rightSeq, top, right, false)

      if (pushLeft || pushRight) this._stack.push(top)
    }

    if (doneLeft) return call(cb, left, null)
    if (doneRight) return call(cb, null, right)

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

function set (top, left, node) {
  if (left) top.left = node
  else top.right = node
}

function call (cb, left, right) {
  cb(null, {
    type: (left && right) ? 'update' : (left ? 'del' : 'put'),
    key: left ? left.key : right.key,
    left,
    right
  })
}

function trie (node, i) {
  return (node && node.trie[i]) || []
}

function seq (node) {
  return node ? node.seq : 0
}

function done (node, i) {
  return !!node && i >= node.length
}
