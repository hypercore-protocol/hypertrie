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

  for (var i = 4; i < bucket.length; i++) {
    this._db.getBySeq(bucket[i], onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && n.key === self._node.key) node = n
    if (!--missing) self._callback(error, error ? null : node)
  }
}

Get.prototype._update = function (i, head) {
  if (!head) return this._callback(null, null)

  if (this._onnode) this._onnode(head)
  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    if (head.path(i) === val) continue

    const bucket = head.trie[i] || []
    const seq = bucket[val]

    if (seq) this._updateHead(i, seq)
    else this._callback(null, null)
    return
  }

  if (this._prefix || head.key === node.key) return this._callback(null, head)

  // hash matches but key doesn't - we have a collision
  this._collision(head)
}

Get.prototype._updateHead = function (i, seq) {
  const self = this
  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    self._update(i + 1, node)
  }
}
