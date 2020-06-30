const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key, flags: (opts && opts.hidden) ? Node.Flags.HIDDEN : 0}, 0, null, db.hash)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._closest = !!(opts && opts.closest)
  this._length = this._node.length - (this._prefix ? 1 : 0)
  this._onseq = (opts && opts.onseq) || null
  this._options = opts ? { wait: opts.wait, timeout: opts.timeout, onwait: null } : { onwait: null }
  this._extension = (!opts || opts.extension !== false) ? this._db._extension : null
  this._extensionSent = !this._extension
  this._head = 0
  this._onheadseq = (opts && opts.onheadseq) || null
  this._options.onwait = this._extension ? this._sendExt.bind(this) : ((opts && opts.onwait) || null)

  this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.headSeq(this._options, onheadseq)

  function onheadseq (err, seq) {
    if (err) return self._callback(err, null)
    if (!seq) return onhead(null, null)

    if (self._onheadseq) self._onheadseq(seq)
    self._head = seq

    if (self._onseq) self._onseq(seq)
    self._db.getBySeq(seq, self._options, onhead)
  }

  function onhead (err, head) {
    if (err) return self._callback(err, null)
    self._update(0, head)
  }
}

Get.prototype._sendExt = function () {
  if (this._head && this._extension && !this._extensionSent) {
    this._options.onwait = null
    this._extensionSent = true
    this._extension.get(this._head, this._node.key)
  }
}

Get.prototype._update = function (i, head) {
  if (!head) return this._callback(null, null)

  const node = this._node

  for (; i < this._length; i++) {
    const val = node.path(i)
    const checkCollision = Node.terminator(i)

    if (head.path(i) === val) {
      if (!checkCollision || !node.collides(head, i)) continue
    }

    const bucket = head.trie[i] || []

    if (checkCollision) return this._updateHeadCollides(i, bucket, val)

    const seq = bucket[val]
    if (!seq) return this._callback(null, this._closest ? head.final() : null)

    return this._updateHead(i, seq)
  }

  this._callback(null, head.final())
}

Get.prototype._updateHeadCollides = function (i, bucket, val) {
  const self = this
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++

    if (this._onseq) this._onseq(seq)
    this._db.getBySeq(seq, this._options, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return

    if (!node || error) return self._callback(error, this._closest ? this._node : null)
    self._update(i + 1, node)
  }
}

Get.prototype._updateHead = function (i, seq) {
  const self = this

  if (this._onseq) this._onseq(seq)
  this._db.getBySeq(seq, this._options, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    self._update(i + 1, node)
  }
}
