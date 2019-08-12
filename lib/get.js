const Node = require('./node')

module.exports = Get

function Get (db, key, opts, cb) {
  this._db = db
  this._node = new Node({key, flags: (opts && opts.hidden) ? Node.Flags.HIDDEN : 0}, 0, null)
  this._callback = cb
  this._prefix = !!(opts && opts.prefix)
  this._closest = !!(opts && opts.closest)
  this._length = this._node.length - (this._prefix ? 1 : 0)
  this._onnode = (opts && opts.onnode) || null
  this._options = opts ? { wait: opts.wait, timeout: opts.timeout } : null
  this._intercept = opts && opts.intercept

  this.state = {
    target: this._node,
    head: null,
    i: 0
  }

  this._start()
}

Get.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._callback(err, null)
    self.state.head = head
    self._update()
  }
}

Get.prototype._update = function () {
  if (!this.state.head) return this._callback(null, null)

  // if (this._onnode) this._onnode(head)
  const state = this.state
  const node = state.target


  for (; state.i < this._length; state.i++) {
    const val = node.path(state.i)
    const checkCollision = Node.terminator(state.i)

    if (state.head.path(state.i) === val) {
      if (!checkCollision || !node.collides(state.head, state.i)) continue
    }

    const bucket = state.head.trie[state.i] || []

    if (checkCollision) return this._updateHeadCollides(state.i, bucket, val)

    const seq = bucket[val]
    if (!seq) return this._callback(null, this._closest ? head.final() : null)

    return this._updateHead(state.i, seq)
  }

  this._callback(null, state.head.final())
}

Get.prototype._updateHeadCollides = function (i, bucket, val) {
  const self = this
  const state = this.state
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._db.getBySeq(seq, this._options, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self.state.target, i)) node = n
    if (--missing) return

    if (!node || error) return self._callback(error, this._closest ? state.target : null)

    state.i = i + 1
    state.head = node

    self._intercept(state, function (err, newState) {
      if (err) throw err
      self.state = newState || state
      self._update()
    })
  }
}

Get.prototype._updateHead = function (i, seq) {
  const self = this
  const state = this.state
  this._db.getBySeq(seq, this._options, onnode)

  function onnode (err, node) {
    if (err) return self._callback(err, null)
    state.i = i + 1
    state.head = node

    self._intercept(state, function (err, newState) {
      if (err) throw err
      self.state = newState || state
      self._update()
    })
  }
}
