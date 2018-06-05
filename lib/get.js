const Node = require('./node')

module.exports = Get

function Get (db, head, key, cb) {
  this._db = db
  this._head = head
  this._node = new Node({key})
  this._i = 0
  this._callback = cb

  if (this._head) this._update()
  else this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err, false)
    if (!head) return self._finalize(null, false)
    self._head = head
    self._update()
  }
}

Get.prototype.then = function (resolve, reject) {
  this._callback = function (err, node) {
    if (err) reject(err)
    else resolve(node)
  }
}

Get.prototype._update = function () {
  const head = this._head
  const node = this._node

  for (; this._i < node.length; this._i++) {
    const i = this._i
    if (head.path(i) === node.path(i)) continue
    const bucket = head.trie[i] || []
    const seq = bucket[node.path(i)]

    if (!seq) return this._finalize(null, false)
    this._updateHead(seq)
    return
  }

  this._finalize(null, true)
}

Get.prototype._updateHead = function (seq) {
  const self = this

  this.db.getBySeq(seq, function (err, node) {
    if (err) return self._finalize(err, false)
    self._head = node
    self._update()
  })
}

Get.prototype._finalize = function (err, found) {
  if (err) return this._callback(err)
  this._callback(null, found ? this._head : null)
}
