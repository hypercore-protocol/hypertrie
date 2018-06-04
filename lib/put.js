const Node = require('./node')

module.exports = Put

function Put (db, head, key, value, batch, cb) {
  this.db = db
  this.head = head
  this.node = new Node({key, value})
  this.i = 0
  this.callback = cb
  this.release = null
  this.batch = batch

  if (this.head) this.lockAndUpdate()
  else this.start()
}

Put.prototype.then = function (resolve, reject) {
  this.callback = function (err, val) {
    if (err) reject(err)
    else resolve(val)
  }
}

Put.prototype.start = function () {
  const self = this
  this.db.head(onhead)

  function onhead (err, head) {
    if (err) return self.finalize(err)
    self.head = head
    self.lockAndUpdate()
  }
}

Put.prototype.lockAndUpdate = function () {
  if (this.batch) return this.update()

  const self = this

  this.db.lock(function (release) {
    self.release = release
    self.update()
  })
}

Put.prototype.finalize = function (err) {
  const self = this

  if (err) return done(err)

  this.node.seq = this.db.feed.length

  if (this.batch) {
    this.node.seq += this.batch.nodes.length
    this.batch.nodes.push(this.node)
    return done(null)
  }

  this.db.feed.append(this.node.encode(), done)

  function done (err) {
    if (self.release) self.release(self.callback, err)
    else self.callback(null)
  }
}

Put.prototype.push = function (val, seq) {
  push(this.node.trie, this.i, val, seq)
}

Put.prototype.update = function () {
  const head = this.head
console.log('update')
  for (; this.i < this.node.length; this.i++) {
    const i = this.i
    const val = this.node.path(i)
    const bucket = head.trie[i] || []

    for (var j = 0; j < bucket.length; j++) {
      if (j === val && val !== 4) continue

      const seq = bucket[j]
      if (!seq) continue
      this.push(j, seq)
    }

    if (head.path(i) === val && head.path(i) < 4) continue 
 
    this.push(head.path(i), head.seq)
    const seq = bucket[val]
    if (!seq) return this.finalize(null)
    this.updateHead(seq)
    return
  }
}

Put.prototype.updateHead = function (seq) {
  const self = this

  if (this.batch && this.batch.offset <= seq) {
    process.nextTick(onnode, null, this.batch.nodes[seq - this.batch.offset])
    return
  }

  this.db.getBySeq(seq, onnode)

  function onnode (err, node) {
    if (err) return self.finalize(err)
    self.head = node
    self.update()
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
