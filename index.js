const Node = require('./lib/node')
const Get = require('./lib/get')
const Put = require('./lib/put')
const Batch = require('./lib/batch')
const { Header } = require('./lib/messages')
const mutexify = require('mutexify')
const thunky = require('thunky')

module.exports = HyperTrie

function HyperTrie (feed) {
  if (!(this instanceof HyperTrie)) return new HyperTrie(feed)

  const self = this

  this.feed = feed
  this.lock = mutexify()
  this.opened = false
  this.ready = thunky(ready)

  function ready (cb) {
    self._ready(cb)
  }
}

HyperTrie.prototype._ready = function (cb) {
  const self = this

  this.feed.ready(function (err) {
    if (err) return done(err)

    if (self.feed.length) return done(null)
    self.feed.append(Header.encode({protocol: 'hypertrie'}), done)

    function done (err) {
      if (err) return cb(err)
      self.opened = true
      cb(null)
    }
  })
}

HyperTrie.prototype.head = function (cb) {
  if (!this.opened) return readyAndHead(this, cb)
  if (!this.feed.length) return cb(null, null)
  this.getBySeq(this.feed.length - 1, cb)
}

HyperTrie.prototype.get = function (key, cb) {
  return new Get(this, null, key, cb)
}

HyperTrie.prototype.batch = function (ops, cb) {
  return new Batch(this, null, ops, cb || noop)
}

HyperTrie.prototype.put = function (key, value, cb) {
  return new Put(this, null, key, value, true, cb || noop)
}

HyperTrie.prototype.getBySeq = function (seq, cb) {
  this.feed.get(seq, onnode)

  function onnode (err, val) {
    if (err) return cb(err)
    const node = Node.decode(val)
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
