const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key}, 0, null)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._length = this._node.length - (this._prefix ? 1 : 0)

  this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err, null)
    self._update(0, head)
  }
}

Get.prototype.then = function (resolve, reject) {
  this._callback = function (err, node) {
    if (err) reject(err)
    else resolve(node)
  }
}

Get.prototype._update = function (i, head) {
  if (!head) return this._finalize(null, null)
  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)

    if (head.path(i) === val) continue
    const bucket = head.trie[i] || []
    const seq = bucket[val]

    if (!seq) return this._finalize(null, null)
    this._updateHead(i, seq)
    return
  }

  this._finalize(null, head)
}

Get.prototype._updateHead = function (i, seq) {
  const self = this

  this._db.getBySeq(seq, function (err, node) {
    if (err) return self._finalize(err, null)
    self._update(i + 1, node)
  })
}

Get.prototype._finalize = function (err, node) {
  if (err) return this._callback(err)
  this._callback(null, node)
}
