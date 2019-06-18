const Node = require('./lib/node')
const Get = require('./lib/get')
const Put = require('./lib/put')
const Batch = require('./lib/batch')
const Delete = require('./lib/del')
const History = require('./lib/history')
const Iterator = require('./lib/iterator')
const Watch = require('./lib/watch')
const Diff = require('./lib/diff')
const { Header } = require('./lib/messages')
const mutexify = require('mutexify')
const thunky = require('thunky')
const codecs = require('codecs')
const bulk = require('bulk-write-stream')
const toStream = require('nanoiterator/to-stream')
const isOptions = require('is-options')
const hypercore = require('hypercore')
const inherits = require('inherits')
const events = require('events')

module.exports = HyperTrie

function HyperTrie (storage, key, opts) {
  if (!(this instanceof HyperTrie)) return new HyperTrie(storage, key, opts)

  if (isOptions(key)) {
    opts = key
    key = null
  }

  if (!opts) opts = {}

  events.EventEmitter.call(this)

  this.id = null
  this.key = null
  this.discoveryKey = null
  this.secretKey = null
  this.metadata = opts.metadata || null
  this.valueEncoding = opts.valueEncoding ? codecs(opts.valueEncoding) : null

  const feedOpts = Object.assign({}, opts, { valueEncoding: 'binary' })
  this.feed = opts.feed || hypercore(storage, key, feedOpts)
  this.opened = false
  this.ready = thunky(this._ready.bind(this))

  this._watchers = []
  this._checkout = (opts && opts.checkout) || 0
  this._lock = mutexify()

  if (this.feed !== opts.feed) this.feed.on('error', this._onerror.bind(this))
  if (!this._checkout) this.feed.on('append', this._onappend.bind(this))
}

inherits(HyperTrie, events.EventEmitter)

Object.defineProperty(HyperTrie.prototype, 'version', {
  enumerable: true,
  get: function () {
    return this._checkout || this.feed.length
  }
})

HyperTrie.prototype._onerror = function (err) {
  this.emit('error', err)
}

HyperTrie.prototype._onappend = function () {
  for (var i = 0; i < this._watchers.length; i++) {
    this._watchers[i].update()
  }

  this.emit('append')
}

HyperTrie.prototype._ready = function (cb) {
  const self = this

  this.feed.ready(function (err) {
    if (err) return done(err)

    if (self.feed.length || !self.feed.writable) return done(null)
    self.feed.append(Header.encode({type: 'hypertrie', metadata: self.metadata}), done)

    function done (err) {
      if (err) return cb(err)
      if (self._checkout === -1) self._checkout = self.feed.length
      self.id = self.feed.id
      self.key = self.feed.key
      self.discoveryKey = self.feed.discoveryKey
      self.secretKey = self.feed.secretKey
      self.opened = true
      self.emit('ready')
      cb(null)
    }
  })
}

HyperTrie.prototype.getMetadata = function (cb) {
  this.feed.get(0, { valueEncoding: Header }, (err, header) => {
    if (err) return cb(err)
    return cb(null, header.metadata)
  })
}

HyperTrie.prototype.setMetadata = function (metadata) {
  // setMetadata can only be called before this.ready is first called.
  if (this.feed.length || !this.feed.writable) throw new Error('The metadata must be set before any puts have occurred.')
  this.metadata = metadata
}

HyperTrie.prototype.replicate = function (opts) {
  return this.feed.replicate(opts)
}

HyperTrie.prototype.checkout = function (version) {
  if (version === 0) version = 1
  return new HyperTrie(null, null, {
    checkout: version || 1,
    valueEncoding: this.valueEncoding,
    feed: this.feed
  })
}

HyperTrie.prototype.snapshot = function () {
  return this.checkout(this.version)
}

HyperTrie.prototype.head = function (cb) {
  if (!this.opened) return readyAndHead(this, cb)
  if (this._checkout !== 0) return this.getBySeq(this._checkout - 1, cb)
  if (this.feed.length < 2) return process.nextTick(cb, null, null)
  this.getBySeq(this.feed.length - 1, cb)
}

HyperTrie.prototype.list = function (prefix, opts, cb) {
  if (typeof prefix === 'function') return this.list('', null, prefix)
  if (typeof opts === 'function') return this.list(prefix, null, opts)

  const ite = this.iterator(prefix, opts)
  const res = []

  ite.next(function loop (err, node) {
    if (err) return cb(err)
    if (!node) return cb(null, res)
    res.push(node)
    ite.next(loop)
  })
}

HyperTrie.prototype.iterator = function (prefix, opts) {
  if (isOptions(prefix)) return this.iterator('', prefix)
  return new Iterator(this, prefix, opts)
}

HyperTrie.prototype.createReadStream = function (prefix, opts) {
  return toStream(this.iterator(prefix, opts))
}

HyperTrie.prototype.history = function (opts) {
  return new History(this, opts)
}

HyperTrie.prototype.createHistoryStream = function (opts) {
  return toStream(this.history(opts))
}

HyperTrie.prototype.diff = function (other, prefix, opts) {
  if (Buffer.isBuffer(other)) return this.diff(0, prefix, Object.assign(opts || {}, { checkpoint: other }))
  if (isOptions(prefix)) return this.diff(other, null, prefix)
  const checkout = (typeof other === 'number' || !other) ? this.checkout(other) : other
  return new Diff(this, checkout, prefix, opts)
}

HyperTrie.prototype.createDiffStream = function (other, prefix, opts) {
  return toStream(this.diff(other, prefix, opts))
}

HyperTrie.prototype.get = function (key, opts, cb) {
  if (typeof opts === 'function') return this.get(key, null, opts)
  return new Get(this, key, opts, cb)
}

HyperTrie.prototype.watch = function (key, onchange) {
  if (typeof key === 'function') return this.watch('', key)
  return new Watch(this, key, onchange)
}

HyperTrie.prototype.batch = function (ops, cb) {
  return new Batch(this, ops, cb || noop)
}

HyperTrie.prototype.put = function (key, value, opts, cb) {
  if (typeof opts === 'function') return this.put(key, value, null, opts)
  opts = Object.assign({}, opts, {
    batch: null,
    del: 0
  })
  return new Put(this, key, value, opts, cb || noop)
}

HyperTrie.prototype.del = function (key, opts, cb) {
  if (typeof opts === 'function') return this.del(key, null, opts)
  opts = Object.assign({}, opts, {
    batch: null
  })
  return new Delete(this, key, opts, cb)
}

HyperTrie.prototype.createWriteStream = function (opts) {
  const self = this
  return bulk.obj(write)

  function write (batch, cb) {
    if (batch.length && Array.isArray(batch[0])) batch = flatten(batch)
    self.batch(batch, cb)
  }
}

HyperTrie.prototype.getBySeq = function (seq, opts, cb) {
  if (typeof opts === 'function') return this.getBySeq(seq, null, opts)
  if (seq < 1) return process.nextTick(cb, null, null)

  const self = this
  this.feed.get(seq, opts, onnode)

  function onnode (err, val) {
    if (err) return cb(err)
    const node = Node.decode(val, seq, self.valueEncoding)
    // early exit for the key: '' nodes we write to reset the db
    if (!node.value && !node.key) return cb(null, null)
    cb(null, node)
  }
}

function noop () {}

function readyAndHead (self, cb) {
  self.ready(function (err) {
    if (err) return cb(err)
    self.head(cb)
  })
}

function flatten (list) {
  const result = []
  for (var i = 0; i < list.length; i++) {
    const next = list[i]
    for (var j = 0; j < next.length; j++) result.push(next[j])
  }
  return result
}
