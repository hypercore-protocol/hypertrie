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

  if (onchange) this.on('change', onchange)
  this._db._addWatch(this)
  this.update()
}

inherits(Watch, events.EventEmitter)

Watch.prototype.destroy = function () {
  this._db._removeWatch(this)
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
