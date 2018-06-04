const Node = require('./node')

module.exports = Get

function Get (db, head, key, cb) {
  this.db = db
  this.head = head
  this.node = new Node({key})
  this.i = 0
  this.callback = cb

  if (this.head) this.update()
  else this.start()
}

Get.prototype.start = function () {
  const self = this
  this.db.head(onhead)

  function onhead (err, head) {
    if (err) return self.finalize(err, false)
    if (!head) return self.finalize(null, false)
    self.head = head
    self.update()
  }
}

Get.prototype.then = function (resolve, reject) {
  this.callback = function (err, node) {
    if (err) reject(err)
    else resolve(node)
  }
}

Get.prototype.update = function () {
  const head = this.head
  const node = this.node

  for (; this.i < node.length; this.i++) {
    const i = this.i
    if (head.path(i) === node.path(i)) continue
    const bucket = head.trie[i] || []
    const seq = bucket[node.path(i)]

    if (!seq) return this.finalize(null, false)
    this.updateHead(seq)
    return
  }

  this.finalize(null, true)
}

Get.prototype.updateHead = function (seq) {
  const self = this
  this.db.getBySeq(seq, function (err, node) {
    if (err) return self.finalize(err, false)
    self.head = node
    self.update()
  })
}

Get.prototype.finalize = function (err, found) {
  if (err) return this.callback(err)
  this.callback(null, found ? this.head : null)
}
