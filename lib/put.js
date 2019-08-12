const Node = require('./node')

module.exports = Put

function putDefaultOptions (opts) {
  return Object.assign({}, {
    condition: null,
    closest: false,
    hidden: false,
    valueBuffer: null,
    flags: 0
  }, opts)
}

function Put (db, key, value, opts, cb) {
  let { hidden, condition, valueBuffer, flags, batch, del, closest } = putDefaultOptions(opts)

  this._db = db

  // The flags are shifted in order to both hide the internal flags and support user-defined flags.
  flags = (flags << 8) | (hidden ? Node.Flags.HIDDEN : 0)

  this._node = new Node({key, value, valueBuffer, flags}, 0, db.valueEncoding)
  this._callback = cb
  this._release = null
  this._batch = batch
  this._closest = closest
  this._condition = condition
  this._error = null
  this._pending = 0
  this._del = del
  this._finalized = false
  this._head = null

  this._link = opts.link
  this._intercept = opts.intercept

  this.state = {
    i: 0,
    head: null,
    target: this._node
  }

  if (this._batch) {
    this.state.head = this._batch.head()
    this._update()

  } else if (this._del) this._start()
  else this._lock()
}

Put.prototype._lock = function () {
  const self = this
  this._db._lock(function (release) {
    self._release = release
    self._start()
  })
}

Put.prototype._start = function () {
  const self = this
  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return self._finalize(err)
    self.state.head = head
    self._update()
  }
}

Put.prototype._finalize = function (err) {
  const self = this

  this._head = this.state.head
  // this._node = this.state.target

  this._finalized = true
  if (this._pending) {
    if (err) this._error = err
    return
  }

  if (this._error) err = this._error
  if (err) return done(err)

  const closest = this._head
  if (this._head && this._head.key !== this._node.key) this._head = null
  if (this._condition) {
    const conditionNode = this._closest ? closest && closest.final() : this._head && this._head.final()
    this._condition(conditionNode, this._node, oncondition)
  } else insert()

  function oncondition (err, proceed) {
    if (err) return done(err)
    if (!proceed) return done(null)
    return insert()
  }

  function insert () {
    if (self._batch) {
      self._batch.append(self._node)
      return done(null, self._node)
    }

    self._node.seq = self._db.feed.length
    self._db.feed.append(self._node.encode(), done)
  }

  function done (err) {
    const node = err ? null : self._node
    if (self._release) self._release(self._callback, err, node)
    else self._callback(err, node)
  }
}

Put.prototype._push = function (i, val, seq) {
  if (seq !== this._del) push(this._node.trie, i, val, seq)
}

Put.prototype._pushCollidable = function (i, val, seq) {
  if (seq === this._del) return

  const self = this
  this._pending++
  this._get(seq, function (err, node) {
    if (err) this._error = err
    else if (node.collides(self._node, i)) push(self._node.trie, i, val, seq)
    if (!--self._pending && self._finalized) self._finalize(null)
  })
}

Put.prototype._update = function () {
  if (!this.state.head) return this._finalize(null)

  const s = this.state
  const node = this.state.target
  const head = this.state.head

  for (; s.i < node.length; s.i++) {
    // check for collision at the end (4) or if it's a prefix terminator
    const checkCollision = Node.terminator(s.i)
    const val = node.path(s.i)
    const bucket = head.trie[s.i] || []
    const headVal = head.path(s.i)
    for (var j = 0; j < bucket.length; j++) {
      // if same hash prefix, if no collision check is needed just continue
      if (j === val && !checkCollision) continue

      const seq = bucket[j]
      if (!seq) continue // skip no-ops

      if (!checkCollision) { // TODO: can prob optimise this with a || j !== val
        this._push(s.i, j, seq)
      } else {
        this._pushCollidable(s.i, j, seq)
      }
    }

    // we copied the head bucket, if this is still the closest node, continue
    // if no collision is possible
    if (headVal === val && (!checkCollision || !node.collides(head, s.i))) continue

    this._push(s.i, headVal, head.seq)

    if (checkCollision) return this._updateHeadCollidable(s.i, bucket, val)

    const seq = bucket[val]
    if (!seq) break
    return this._updateHead(s.i, seq)
  }

  this._finalize(null)
}

Put.prototype._get = function (seq, cb) {
  const node = this._batch && this._batch.get(seq)
  if (node) return process.nextTick(cb, null, node)

  const self = this
  this._db.getBySeq(seq, function (err, node) {
    if (err) return cb(err)
    self._link(node, cb)
  })
}

Put.prototype._updateHeadCollidable = function (i, bucket, val) {
  const self = this
  var missing = 1
  var error = null
  var node = null

  for (var j = val; j < bucket.length; j += 5) {
    const seq = bucket[j]
    if (!seq) break
    missing++
    this._get(seq, onnode)
  }

  onnode(null, null)

  function onnode (err, n) {
    if (err) error = err
    else if (n && !n.collides(self._node, i)) node = n
    if (--missing) return

    if (!node) return self._finalize(error)

    self.state.i = i + 1
    self.state.head = node

    self._intercept(self.state, function (err, newState) {
      if (err) throw err
      self.state = newState || self.state
      self._update()
    })
  }
}

Put.prototype._updateHead = function (i, seq) {
  const self = this
  this._get(seq, onnode)

  function onnode (err, node) {
    if (err) return self._finalize(err)

    self.state.i = i + 1
    self.state.head = node

    self._intercept(self.state, function (err, newState) {
      if (err) throw err
      self.state = newState || self.state
      self._update()
    })
  }
}

function push (trie, i, val, seq) {
  while (val >= 5) val -= 5

  const bucket = trie[i] || (trie[i] = [])
  while (bucket.length > val && bucket[val]) val += 5

  if (bucket.indexOf(seq) === -1) bucket[val] = seq
}
