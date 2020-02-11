const set = require('unordered-set')
const inherits = require('inherits')
const events = require('events')

module.exports = Watch

function Watch (db, prefix, onchange) {
  events.EventEmitter.call(this)

  this._db = db
  this._prefix = prefix
  this._destroyed = false
  this._closest = 0
  this._updated = false
  this._kicking = false
  this._index = 0

  const self = this
  const feed = this._db.feed
  const watchers = this._db._watchers

  if (onchange) this.on('change', onchange)
  set.add(watchers, this)
  this.update()

  if (watchers.length === 1 && feed.sparse) {
    feedUpdateLoop()
  }

  function feedUpdateLoop () {
    if (self._destroyed) return
    // TODO: Expose a way to cancel this update when the watcher is destroyed, since it is not ifAvailable.
    feed.update({ ifAvailable: false }, feedUpdateLoop)
  }
}

inherits(Watch, events.EventEmitter)

Watch.prototype.destroy = function () {
  set.remove(this._db._watchers, this)
  this._destroyed = true
}

Watch.prototype.update = function () {
  if (this._destroyed) return
  if (!this._kicking) this._kick()
  else this._updated = true
}

Watch.prototype._done = function (closest) {
  this._kicking = false

  if (closest > this._closest) {
    this._closest = closest
    this._updated = false
    this.emit('change')
    return
  }

  if (this._updated) {
    this._updated = false
    this._kick()
  }
}

Watch.prototype._kick = function () {
  const self = this
  this._kicking = true
  this._db.get(this._prefix, {prefix: true}, done)

  function done (_, node) {
    self._done(node ? node.seq : 0)
  }
}
