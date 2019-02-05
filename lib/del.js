const Put = require('./put')
const Node = require('./node')

module.exports = Delete

function Delete (db, key, { batch, condition = null }, cb) {
  this._db = db
  this._key = key
  this._callback = cb
  this._release = null
  this._put = null
  this._batch = batch
  this._condition = condition
  this._node = new Node({key})
  this._length = this._node.length
  this._closest = 0

  if (this._batch) this._update(0, this._batch.head())
  else this._lock()
}

Delete.prototype._lock = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Delete.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err, null)
    if (!head) return self._finalize(null, null)
    self._update(0, head)
  }
}

Delete.prototype._finalize = function (err, node) {
  if (!this._release) this._callback(err, node)
  else this._release(this._callback, err, node)
}

Delete.prototype._splice = function (closest, node) {
  const key = closest ? closest.key : ''
  const val = closest ? closest.value : null
  const self = this

  if (this._condition) this._condition(node.value, onCondition)
  else del()

  function onCondition (err, proceed) {
    if (err) return done(err)
    if (!proceed) return done(null)
    return del()
  }

  function del () {
    self._put = new Put(self._db, key, val, { batch: self._batch, del: node.seq }, done)
  }

  function done (err, node) {
    self._finalize(err, node)
  }
}

Delete.prototype._update = function (i, head) {
  if (!head) return this._finalize(null, null)

  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const bucket = head.trie[i] || []

    if (head.path(i) === val) {
      const closest = firstSeq(bucket, val)
      if (closest) this._closest = closest
      continue
    }

    const seq = bucket[val]
    if (!seq) return this._finalize(null, null)

    this._closest = head.seq
    this._updateHead(i, seq)
    return
  }

  // TODO: collisions
  if (node.key !== head.key) return this._finalize(null, null)
  this._spliceClosest(head)
}

Delete.prototype._spliceClosest = function (head) {
  if (!this._closest) return this._splice(null, head)

  const self = this

  this._get(this._closest, function (err, closest) {
    if (err) return self._finalize(err, null)
    self._splice(closest, head)
  })
}

Delete.prototype._get = function (seq, onnode) {
  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(onnode, null, node)
  this._db.getBySeq(seq, onnode)
}

Delete.prototype._updateHead = function (i, seq) {
  const self = this
  this._get(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err, null)
    self._update(i + 1, node)
  }
}

function firstSeq (bucket, val) {
  for (var i = 0; i < bucket.length; i++) {
    if (i === val) continue
    const seq = bucket[i]
    if (seq) return seq
  }
  return 0
}
