const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key}, 0, null)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._length = this._node.length - (this._prefix ? 1 : 0)
  this._onnode = (opts && opts.onnode) || null
  this._batch = (opts && opts.batch) || null

  if (this._batch) this._updateBatch()
  else this._start()
}

Get.prototype._updateBatch = function () {
  const self = this
  process.nextTick(function () {
    self._update(0, self._batch.head())
  })
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._callback(err, null)
    self._update(0, head)
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

    if (!seq) return this._callback(null, null)
    this._updateHead(i, seq)
    return
  }

  this._callback(null, head)
}

Get.prototype._updateHead = function (i, seq) {
  const self = this

  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(onnode, null, node)

  this._db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    self._update(i + 1, node)
  }
}
