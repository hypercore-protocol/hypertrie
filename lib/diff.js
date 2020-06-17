const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')
const varint = require('varint')

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
  this._left = []
  this._right = []
  this._onnode = (opts && opts.onnode) || null
  this._hidden = !!(opts && opts.hidden)
  this._needsCheck = []
  this._skipLeftNull = !!(opts && opts.skipLeftNull)
  this._skipRightNull = !!(opts && opts.skipRightNull)
  this._checkpoint = (opts && opts.checkpoint) || null
  this._reconnect = !!(opts && opts.reconnect)
  this._pendingQueue = []
  this.maxInflight = (opts && opts.maxInflight) || (this._reconnect ? 4 : Infinity)
  if (this._reconnect) this._skipRightNull = true
}

inherits(Diff, Nanoiterator)

Diff.prototype._open = function (cb) {
  if (this._checkpoint) return this._openCheckpoint(cb)

  const self = this
  const opts = {onnode: this._onnode, prefix: true, hidden: this._hidden}
  const get = this._db.get(this._prefix, opts, function (err, a) {
    if (err) return cb(err)
    self._checkout.get(self._prefix, opts, function (err, b) {
      if (err) return cb(err)
      self._stack.push({i: get._length, left: a, right: b, skip: false})
      cb(null)
    })
  })
}

Diff.prototype._openCheckpoint = function (cb) {
  const self = this
  const buf = this._checkpoint
  var ptr = 0

  loop()

  function loop () {
    if (ptr >= buf.length) return cb(null)

    const i = varint.decode(buf, ptr)
    ptr += varint.decode.bytes
    const l = varint.decode(buf, ptr)
    ptr += varint.decode.bytes
    const r = varint.decode(buf, ptr)
    ptr += varint.decode.bytes

    self._db.getBySeq(l, function (err, left) {
      if (err) return cb(err)
      self._db.getBySeq(r, function (err, right) {
        if (err) return cb(err)
        self._stack.push({i, left, right, skip: false})
        loop()
      })
    })
  }
}

Diff.prototype.checkpoint = function () {
  const buf = Buffer.alloc(this._stack.length * 8 * 3)
  var ptr = 0

  for (var i = 0; i < this._stack.length; i++) {
    const s = this._stack[i]
    if (s.skip) continue
    varint.encode(s.i, buf, ptr)
    ptr += varint.encode.bytes
    varint.encode(s.left ? s.left.seq : 0, buf, ptr)
    ptr += varint.encode.bytes
    varint.encode(s.right ? s.right.seq : 0, buf, ptr)
    ptr += varint.encode.bytes
  }
  return buf.slice(0, ptr)
}

Diff.prototype._finalize = function () {
  const callback = this._callback
  if (!callback) return

  if (this.closed) return callback(new Error('Iterator closed'))

  const err = this._error
  this._callback = this._error = null
  if (err) return callback(err)

  while (this._needsCheck.length) {
    const end = this._needsCheck.pop()
    const start = this._needsCheck.pop()
    this._maybeCollides(start, end)
  }

  this._next(callback)
}

Diff.prototype._next = function (cb) {
  this._nextAsync(cb)
}

Diff.prototype._has = async function (seq) {
  this._pending++
  try {
    return await this._db.feed.has(seq)
  } catch (err) {
    this._error = err
  } finally {
    this._pending--
  }
}

Diff.prototype._nextAsync = async function (cb) {
  if (this._pending) {
    this._callback = cb
    return
  }

  if (this._error) return cb(this._error)

  while (this._stack.length) {
    const {i, left, right, skip} = this._stack.pop()

    if (skip || seq(left) === seq(right)) continue

    const doneLeft = done(left, i)
    const doneRight = done(right, i)

    if (doneLeft && doneRight) return call(cb, left, right)

    if (!right && left && this._skipRightNull) continue
    if (right && !left && this._skipLeftNull) continue

    const leftVal = left ? left.path(i) : 5
    const rightVal = right ? right.path(i) : 6
    const leftBucket = trie(left, i)
    const rightBucket = trie(right, i)

    for (var j = 0; j < 5; j++) {
      const leftSeq = leftVal === j ? left.seq : 0
      const rightSeq = rightVal === j ? right.seq : 0
      const len = this._stack.length
      var leftLen = this._stack.length
      var rightLen = this._stack.length
      var val

      if (leftSeq !== rightSeq) {
        if (!doneLeft && leftSeq && notInBucket(j, leftSeq, rightBucket)) {
          set(this._pushStack(leftLen++, i + 1), true, left)
        }
        if (!doneRight && rightSeq && notInBucket(j, rightSeq, leftBucket)) {
          set(this._pushStack(rightLen++, i + 1), false, right)
        }
      }

      if (!doneLeft) {
        const pushLeft = !this._skipRightNull || (rightBucket[j] && (!this._reconnect || await this._hasSeqInBucket(rightBucket, j)))
        for (val = j; val < leftBucket.length; val += 5) {
          const seq = leftBucket[val]
          if (!seq) break
          if (seq !== rightSeq && notInBucket(j, seq, rightBucket)) {
            const top = this._pushStack(leftLen++, i + 1)
            if (pushLeft || top.right) this._getNode(seq, top, true)
            else top.skip = true
          }
        }
      }

      if (!doneRight) {
        const pushRight = !this._skipLeftNull || leftBucket[j]
        for (val = j; val < rightBucket.length; val += 5) {
          const seq = rightBucket[val]
          if (!seq) break
          if (seq !== leftSeq && notInBucket(j, seq, leftBucket) && (!this._reconnect || await this._has(seq))) {
            const top = this._pushStack(rightLen++, i + 1)
            if (pushRight || top.left) this._getNode(seq, top, false)
            else top.skip = true
          }
        }
      }

      if (Node.terminator(i) && this._stack.length > len) {
        if (!this._pending) this._maybeCollides(len, this._stack.length)
        else this._needsCheck.push(len, this._stack.length)
      }
    }

    if (doneLeft) return call(cb, left, null)
    if (doneRight) return call(cb, null, right)

    if (!this._pending) continue
    this._callback = cb
    return
  }

  cb(null, null)
}

Diff.prototype._hasSeqInBucket = async function (bucket, val) {
  for (; val < bucket.length; val += 5) {
    if (bucket[val] && await this._has(bucket[val])) return true
  }
  return false
}

Diff.prototype._maybeCollides = function (start, end) {
  // all nodes, start -> end, share the same hash
  // we need to check that there are no collisions

  // much simpler and *much* more likely - only one node
  if (end - start === 1) {
    const top = this._stack[start]
    if (collides(top)) {
      this._stack.push({i: top.i, left: null, right: top.right, skip: top.skip})
      top.right = null
    }
    return
  }

  // very unlikely, but multiple collisions or a trie reordering
  // due to a collision being deleted

  for (var i = start; i < end; i++) {
    const top = this._stack[i]
    if (collides(top) || !top.left) {
      const right = top.right
      for (var j = start; j < end; j++) {
        const other = this._stack[j]
        if (other.left && !other.left.collides(right)) {
          top.right = other.right
          other.right = right
          i-- // revisit top again, as it might still collide
          break
        }
      }
      if (top.right === right && top.left) {
        this._stack.push({i: top.i, left: null, right, skip: top.skip})
        top.right = null
      }
    }
  }
}

Diff.prototype._pushStack = function (len, i) {
  if (this._stack.length === len) this._stack.push({i, left: null, right: null, skip: false})
  return this._stack[len]
}

Diff.prototype._getNode = function (seq, top, left) {
  const self = this
  this._pending++

  const inflight = this._pending - this._pendingQueue.length
  if (inflight >= this.maxInflight) {
    this._pendingQueue.push([seq, top, left])
    return
  }

  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (self._onnode && node) self._onnode(node)
    if (node) set(top, left, node)
    else if (err) self._error = err
    if (!--self._pending) self._finalize()

    if (self._pendingQueue.length && self._pending - self._pendingQueue.length < self.maxInflight) {
      const [seq, top, left] = self._pendingQueue.pop()
      self._pending--
      self._getNode(seq, top, left)
    }
  }
}

function notInBucket (val, seq, bucket) {
  for (; val < bucket.length; val += 5) {
    if (bucket[val] === seq) return false
  }
  return true
}

function set (top, left, node) {
  if (left) top.left = node
  else top.right = node
}

function call (cb, left, right) {
  cb(null, {
    key: left ? left.key : right.key,
    left: left && left.final(),
    right: right && right.final()
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

function collides (top) {
  if (!top.left || !top.right || !Node.terminator(top.i)) return false
  return top.left.collides(top.right, top.i)
}
