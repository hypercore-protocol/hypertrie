const Nanoiterator = require('nanoiterator')
const inherits = require('inherits')

module.exports = History

function History (db, opts) {
  if (!opts) opts = {}
  if (typeof opts.gt === 'number') opts.gte = opts.gt + 1
  if (typeof opts.lt === 'number') opts.lte = opts.lt - 1

  Nanoiterator.call(this)

  this._gte = ifNumber(opts.gte, 1)
  this._lte = ifNumber(opts.lte, -1)
  this._reverse = !!(opts && opts.reverse)
  this._db = db
  this._live = !!(opts && opts.live)
}

inherits(History, Nanoiterator)

History.prototype._open = function (cb) {
  const self = this

  if (this._live && !this._reverse) {
    this._lte = Infinity
    return cb(null)
  }

  this._db.head(onhead)

  function onhead (err, head) {
    if (err) return cb(err)
    const headSeq = head ? head.seq : -1
    self._lte = self._lte === -1 ? headSeq : Math.min(self._lte, headSeq)
    cb(null)
  }
}

History.prototype._next = function (cb) {
  if (this._gte > this._lte) return cb(null, null)
  this._db.getBySeq(this._reverse ? this._lte-- : this._gte++, done)

  function done (err, node) {
    if (err) return cb(err)
    cb(null, node.final())
  }
}

function ifNumber (n, def) {
  return typeof n === 'number' ? n : def
}
