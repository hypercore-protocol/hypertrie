const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key}, 0, null)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._length = this._node.length - (this._prefix ? 1 : 0)
  this._onnode = (opts && opts.onnode) || null

  this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._callback(err, null)
    self._update(0, head)
  }
}

Get.prototype._collision = function (head) {
  const self = this
  const bucket = head.trie[this._length - 1] || []
  var error = null
  var node = null
  var missing = bucket.length - 4 + 1

  for (var i = 4; i < bucket.length; i += 5) {
    this._db.getBySeq(bucket[i], onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && n.key === self._node.key) node = n
    if (!--missing) self._callback(error, error ? null : node)
  }
}

Get.prototype._prefixCollision = function () {
  throw new Error('not impl')
}

Get.prototype._update = function (i, head) {
  if (!head) return this._callback(null, null)

  if (this._onnode) this._onnode(head)
  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const checkCollision = node.terminator(i)

    if (head.path(i) === val) {
      if (!checkCollision || !node.collides(head, i)) continue
    }

    const bucket = head.trie[i] || []

    if (checkCollision) return this._updateHeadCollides(i, bucket, val)

    const seq = bucket[val]
    if (!seq) return this._callback(null, null)

    return this._updateHead(i, seq)
  }

  this._callback(null, head)
}

Get.prototype._update2 = function (i, head) {
  if (!head) return this._callback(null, null)

  if (this._onnode) this._onnode(head)
  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const terminator = i > 0 && ((i + 1) & 31) === 0

    if (head.path(i) === val) {
      if (terminator) {
        const bucket = head.trie[i] || []
        if (bucket.length > 5 || bucket[val]) {
          this._prefixCollision(bucket, i, val)
          return
        }
      }
      continue
    }

    const bucket = head.trie[i] || []
    const seq = bucket[val]

    if (seq) this._updateHead(i, seq)
    else this._callback(null, null)
    return
  }

  if (this._prefix || head.key === node.key) return this._callback(null, head)

  // hash matches but key doesn't - we have a collision or prefix

  this._collision(head)
}

Get.prototype._updateHeadCollides = function (i, bucket, val) {
  const self = this
  var missing = 1
  var node = null
  var error = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._db.getBySeq(seq, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return
    if (!node || error) return self._callback(error, null)
    self._update(i + 1, node)
  }
}

Get.prototype._updateHead = function (i, seq) {
  const self = this
  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    self._update(i + 1, node)
  }
}
