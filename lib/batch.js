const Put = require('./put')

module.exports = Batch

function Batch (db, head, ops, cb) {
  this.db = db
  this.ops = ops
  this.callback = cb
  this.head = head
  this.nodes = []
  this.offset = 0
  this.put = null

  this.start()
}

Batch.prototype.then = function (resolve, reject) {
  this.callback = function (err, val) {
    if (err) reject(err)
    else resolve(val)
  }
}

Batch.prototype.finalize = function (err) {
  this.release(this.callback, err)
}

Batch.prototype.start = function () {
  const self = this
  this.db.lock(function (release) {
    self.release = release
    self.db.ready(function () {
      self.offset = self.db.feed.length
      if (self.head) return self.update()
      self.db.head(function (err, head) {
        if (err) return self.finalize(err)
        self.head = head
        self.update()
      })
    })
  })
}

Batch.prototype.update = function () {
  var i = 0
  const self = this

  loop(null)

  function loop (err) {
    if (err) return self.finalize(err)
    if (i === self.ops.length) return self.finalize(null)
    const {key, value} = self.ops[i++]
    self.put = new Put(self.db, self.head, key, value, self, loop)
  }
}
