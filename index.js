const events = require('events')

const mutexify = require('mutexify')
const thunky = require('thunky')
const codecs = require('codecs')
const bulk = require('bulk-write-stream')
const toStream = require('nanoiterator/to-stream')
const isOptions = require('is-options')
const hypercore = require('hypercore')
const inherits = require('inherits')
const alru = require('array-lru')
const set = require('unordered-set')

const Extension = require('./lib/extension')
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
  this.hash = opts.hash || null
  this.valueEncoding = opts.valueEncoding ? codecs(opts.valueEncoding) : null
  this.alwaysUpdate = !!opts.alwaysUpdate
  this.alwaysReconnect = !!opts.alwaysReconnect
  this.subtype = opts.subtype

  const feedOpts = Object.assign({}, opts, { valueEncoding: 'binary' })
  this.feed = opts.feed || hypercore(storage, key, feedOpts)
  this.feed.maxRequests = opts.maxRequests || 256 // set max requests higher since the payload is small
  this.opened = false
  this.ready = thunky(this._ready.bind(this))

  this._extension = opts.extension === false ? null : ((opts.extension === true ? null : opts.extension) || new Extension(this))
  if (this._extension && !this._extension.outgoing) this._extension.outgoing = this.feed.registerExtension('hypertrie', this._extension)

  this._watchers = []
  this._checkout = (opts && opts.checkout) || 0
  this._cache = alru((opts && opts.cacheSize) || 32768)
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

HyperTrie.prototype._removeWatch = function (w) {
  set.remove(this._watchers, w)
}

HyperTrie.prototype._addWatch = function (w) {
  const self = this

  set.add(this._watchers, w)
  if (this._watchers.length > 1 || !this.feed.sparse) return

  this.feed.update({ ifAvailable: false }, function loop () {
    if (self._watchers.length === 0) return
    self.feed.update({ ifAvailable: false }, loop)
  })
}

HyperTrie.prototype.reconnect = function (from, opts) {
  opts = opts ? Object.assign({}, opts, { reconnect: true }) : { reconnect: true }
  return this.diff(from, opts)
}

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
    self.feed.append(Header.encode({
      type: 'hypertrie',
      metadata: self.metadata,
      subtype: this.subtype
    }), done)

    function done (err) {
      if (err) return cb(err)
      if (self._checkout === -1) self._checkout = self.feed.length
      self.id = self.feed.id
      self.key = self.feed.key
      self.discoveryKey = self.feed.discoveryKey
      self.secretKey = self.feed.secretKey
      self.opened = true
      self.emit('ready')

      if (self.alwaysReconnect) {
        var from = self.feed.length
        var active = null

        self.feed.on('append', function () {
          if (!from) {
            from = self.feed.length
            return
          }

          if (active) active.destroy()

          self.emit('reconnecting')
          const r = active = self.reconnect(from)
          active.next(function loop (err, data) {
            if (r !== active) return

            if (err || !data) {
              active = null
              from = self.feed.length
              if (!err) self.emit('reconnected')
              return
            }

            active.next(loop)
          })
        })
      }

      cb(null)
    }
  })
}

HyperTrie.getMetadata = function (feed, cb) {
  feed.get(0, (err, msg) => {
    if (err) return cb(err)

    try {
      var header = Header.decode(msg)
    } catch (err) {
      return cb(err)
    }

    cb(null, header.metadata)
  })
}

HyperTrie.prototype.getMetadata = function (cb) {
  HyperTrie.getMetadata(this.feed, cb)
}

HyperTrie.prototype.setMetadata = function (metadata) {
  // setMetadata can only be called before this.ready is first called.
  if (this.feed.length || !this.feed.writable) throw new Error('The metadata must be set before any puts have occurred.')
  this.metadata = metadata
}

HyperTrie.prototype.replicate = function (isInitiator, opts) {
  return this.feed.replicate(isInitiator, opts)
}

HyperTrie.prototype.checkout = function (version) {
  if (version === 0) version = 1
  return new HyperTrie(null, null, {
    checkout: version || 1,
    valueEncoding: this.valueEncoding,
    feed: this.feed,
    extension: this._extension === null ? false : this._extension
  })
}

HyperTrie.prototype.snapshot = function () {
  return this.checkout(this.version)
}

HyperTrie.prototype.headSeq = function (opts, cb) {
  const self = this

  if (!this.opened) return readyAndHeadSeq(this, opts, cb)
  if (this._checkout !== 0) return process.nextTick(cb, null, this._checkout - 1)
  if (this.alwaysUpdate && (!opts || opts.wait !== false)) this.feed.update({ hash: false, ifAvailable: true }, onupdated)
  else process.nextTick(onupdated)

  function onupdated () {
    if (self.feed.length < 2) return cb(null, 0)
    cb(null, self.feed.length - 1)
  }
}

HyperTrie.prototype.head = function (opts, cb) {
  if (typeof opts === 'function') return this.head(null, opts)

  const self = this
  this.headSeq(opts, function (err, seq) {
    if (err) return cb(err)
    if (!seq) return cb(null, null)
    self.getBySeq(seq, opts, cb)
  })
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

  const cached = this._cache.get(seq)
  if (cached) return process.nextTick(onnode, null, cached)
  this.feed.get(seq, opts, onnode)

  function onnode (err, val) {
    if (err) return cb(err)
    const node = Node.decode(val, seq, self.valueEncoding, self.hash)
    self._cache.set(seq, val)
    // early exit for the key: '' nodes we write to reset the db
    if (!node.value && !node.key) return cb(null, null)
    cb(null, node)
  }
}

function noop () {}

function readyAndHeadSeq (self, opts, cb) {
  self.ready(function (err) {
    if (err) return cb(err)
    self.headSeq(opts, cb)
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
