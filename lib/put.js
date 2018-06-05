const Node = require('./node')

module.exports = Put

function Put (db, head, key, value, batch, cb) {
  this._db = db
  this._head = head
  this._node = new Node({key, value})
  this._i = 0
  this._callback = cb
  this._release = null
  this._batch = batch
  this._error = null
  this._pending = 0
  this._finalized = false

  if (this._head) this._lockAndUpdate()
  else this._start()
}

Put.prototype.then = function (resolve, reject) {
  this._callback = function (err, val) {
    if (err) reject(err)
    else resolve(val)
  }
}

Put.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err)
    self._head = head
    self._lockAndUpdate()
  }
}

Put.prototype._lockAndUpdate = function () {
  if (this._batch) return this._update()

  const self = this

  this._db.lock(function (release) {
    self._release = release
    self._update()
  })
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
    return done(null)
  }

  this._node.seq = this._db.feed.length
  this._db.feed.append(this._node.encode(), done)

  function done (err) {
    if (self._release) self._release(self._callback, err)
    else self._callback(null)
  }
}

Put.prototype._push = function (val, seq) {
  push(this._node.trie, this._i, val, seq)
}

Put.prototype._termination = function (seq) {
  const self = this
  const i = this._i
  this._pending++
  this._db.getBySeq(seq, function (err, node) {
    if (err) this._error = err
    else if (node.key !== self.node.key) push(self._node.trie, i, 4, seq)
    if (!--self._pending && self._finalized) self._finalize(null)
  })
}

Put.prototype._update = function () {
  const head = this._head

  for (; this._i < this._node.length; this._i++) {
    const i = this._i
    const val = this._node.path(i)
    const bucket = head.trie[i] || []
    const headVal = head.path(i)

    for (var j = 0; j < bucket.length; j++) {
      if (j === val && val !== 4) continue

      const seq = bucket[j]
      if (!seq) continue
      if (val === 4) this._termination(seq)
      else this._push(j, seq)
    }

    if (headVal === val && (headVal < 4 || head.key === this._node.key)) continue

    this._push(headVal, head.seq)
    const seq = bucket[val]
    if (!seq) return this._finalize(null)
    this._updateHead(seq)
    return
  }

  this._finalize(null)
}

Put.prototype._updateHead = function (seq) {
  const self = this
  const node = this._batch && this._batch.get(seq)

  if (node) return process.nextTick(onnode, null, node)
  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err)
    self._head = node
    self._update()
  }
}

function push (trie, i, val, seq) {
  const bucket = trie[i] || (trie[i] = [])
  if (val === 4 && bucket.length >= 5) {
    if (bucket.indexOf(seq, 4) === -1) bucket.push(seq)
  } else {
    bucket[val] = seq
  }
}
