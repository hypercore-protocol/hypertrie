const Node = require('./node')

module.exports = Put

function Put (db, key, value, batch, del, cb) {
  this._db = db
  this._node = new Node({key, value}, 0, db.valueEncoding)
  this._callback = cb
  this._release = null
  this._batch = batch
  this._error = null
  this._pending = 0
  this._del = del
  this._finalized = false

  if (this._batch) this._update(0, this._batch.head())
  else if (this._del) this._start()
  else this._lock()
}

Put.prototype._lock = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Put.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err, null)
    self._update(0, head)
  }
}

Put.prototype._finalize = function (err) {
  const self = this

  this._finalized = true
  if (this._pending) {
    if (err) this._error = err
    return
  }

  if (this._error) err = this._error
  if (err) return done(err)

  if (this._batch) {
    this._batch.append(this._node)
    return done(null, this._node)
  }

  this._node.seq = this._db.feed.length
  this._db.feed.append(this._node.encode(), done)

  function done (err) {
    const node = err ? null : self._node
    if (self._release) self._release(self._callback, err, node)
    else self._callback(err, node)
  }
}

Put.prototype._push = function (i, val, seq) {
  if (seq !== this._del) push(this._node.trie, i, val, seq)
}

Put.prototype._pushCollidable = function (i, val, seq) {
  if (seq === this._del) return

  const self = this
  this._pending++
  this._get(seq, function (err, node) {
    if (err) this._error = err
    else if (node.collides(self._node, i)) push(self._node.trie, i, val, seq)
    if (!--self._pending && self._finalized) self._finalize(null)
  })
}

Put.prototype._update = function (i, head) {
  if (!head) return this._finalize(null)

  const node = this._node

  for (; i < node.length; i++) {
    // check for collision at the end (4) or if it's a prefix terminator
    const checkCollision = node.terminator(i)
    const val = node.path(i)
    const bucket = head.trie[i] || []
    const headVal = head.path(i)

    for (var j = 0; j < bucket.length; j++) {
      // if same hash prefix, if no collision check is needed just continue
      if (j === val && !checkCollision) continue

      const seq = bucket[j]
      if (!seq) continue // skip no-ops

      if (!checkCollision) { // TODO: can prob optimise this with a || j !== val
        this._push(i, j, seq)
      } else {
        this._pushCollidable(i, j, seq)
      }
    }

    // we copied the head bucket, if this is still the closest node, continue
    // if no collision is possible
    if (headVal === val && (!checkCollision || !node.collides(head, i))) continue

    this._push(i, headVal, head.seq)

    if (checkCollision) return this._updateHeadCollidable(i, bucket, val)

    const seq = bucket[val]
    if (!seq) break
    return this._updateHead(i, seq)
  }

  this._finalize(null)
}

Put.prototype._get = function (seq, cb) {
  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(cb, null, node)
  this._db.getBySeq(seq, cb)
}

Put.prototype._updateHeadCollidable = function (i, bucket, val) {
  const self = this
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._get(seq, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return

    if (!node) return self._finalize(error)
    self._update(i + 1, node)
  }
}

Put.prototype._updateHead = function (i, seq) {
  const self = this
  this._get(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err)
    self._update(i + 1, node)
  }
}

function push (trie, i, val, seq) {
  while (val >= 5) val -= 5

  const bucket = trie[i] || (trie[i] = [])
  while (bucket.length > val && bucket[val]) val += 5

  if (bucket.indexOf(seq) === -1) bucket[val] = seq
}
