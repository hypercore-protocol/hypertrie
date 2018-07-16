const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')
const Node = require('./node')

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
  this._needsCheck = []
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

Diff.prototype._finalize = function () {
  const callback = this._callback
  if (!callback) return

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

    if (doneLeft && doneRight) return call(cb, left, right)

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
        for (val = j; val < leftBucket.length; val += 5) {
          const seq = leftBucket[val]
          if (!seq) break
          if (seq !== rightSeq && notInBucket(j, seq, rightBucket)) {
            this._getNode(seq, this._pushStack(leftLen++, i + 1), true)
          }
        }
      }

      if (!doneRight) {
        for (val = j; val < rightBucket.length; val += 5) {
          const seq = rightBucket[val]
          if (!seq) break
          if (seq !== leftSeq && notInBucket(j, seq, leftBucket)) {
            this._getNode(seq, this._pushStack(rightLen++, i + 1), false)
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

Diff.prototype._maybeCollides = function (start, end) {
  // all nodes, start -> end, share the same hash
  // we need to check that there are no collisions

  // much simpler and *much* more likely - only one node
  if (end - start === 1) {
    const top = this._stack[start]
    if (collides(top)) {
      this._stack.push({i: top.i, left: null, right: top.right})
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
        this._stack.push({i: top.i, left: null, right})
        top.right = null
      }
    }
  }
}

Diff.prototype._pushStack = function (len, i) {
  if (this._stack.length === len) this._stack.push({i, left: null, right: null})
  return this._stack[len]
}

Diff.prototype._getNode = function (seq, top, left) {
  const self = this
  this._pending++
  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (self._onnode && node) self._onnode(node)
    if (node) set(top, left, node)
    else if (err) self._error = err
    if (!--self._pending) self._finalize()
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

function collides (top) {
  if (!top.left || !top.right) return false
  return top.left.collides(top.right, top.i)
}
