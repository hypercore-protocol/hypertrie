const sodium = require('sodium-universal')
const inspect = require('inspect-custom-symbol')
const messages = require('./messages')
const trie = require('./trie')

const KEY = Buffer.alloc(16)

module.exports = Node

const Flags = {
  HIDDEN: 1
}

function Node (data, seq, enc) {
  this.seq = seq || 0
  this.key = normalizeKey(data.key)
  this.value = data.value !== undefined ? data.value : null
  this.keySplit = split(this.key)
  this.flags = data.flags || 0
  this.hash = hash(this.keySplit)
  this.trie = data.trieBuffer ? trie.decode(data.trieBuffer) : (data.trie || [])
  this.trieBuffer = null
  this.valueBuffer = data.valueBuffer || null
  this.length = this.hash.length * 4 + 1 + 1
  this.valueEncoding = enc
}
Node.Flags = Flags

Node.prototype[inspect] = function (depth, opts) {
  return ((opts && opts.stylize) || defaultStylize)({seq: this.seq, key: this.key, value: this.value}, 'object')
}

Object.defineProperty(Node.prototype, 'hidden', {
  enumerable: true,
  get: function () {
    return !!(this.flags & Flags.HIDDEN)
  }
})

Node.prototype.path = function (i) {
  if (!i) return this.hidden ? 1 : 0
  i--
  const hash = this.hash
  const j = i >> 2
  if (j >= hash.length) return 4
  return (hash[j] >> (2 * (i & 3))) & 3
}

Node.prototype.final = function () {
  if (!this.valueBuffer || this.value !== null) return this
  this.value = this.valueEncoding ? this.valueEncoding.decode(this.valueBuffer) : this.valueBuffer

  // The flags are shifted in order to both hide the internal flags and support user-defined flags.
  this.flags = this.flags >> 8

  this.valueBuffer = null
  return this
}

Node.prototype.preencode = function () {
  if (!this.trieBuffer) this.trieBuffer = trie.encode(this.trie)
  if (!this.valueBuffer) this.valueBuffer = ((this.value !== null) && this.valueEncoding) ? this.valueEncoding.encode(this.value) : this.value
}

Node.prototype.encode = function () {
  this.preencode()
  return messages.Node.encode(this)
}

Node.prototype.collides = function (node, i) {
  if (!i) return false
  if (i === this.length - 1) return this.key !== node.key
  const j = Math.floor((i - 1) / 32)
  return this.keySplit[j] !== node.keySplit[j]
}

Node.decode = function (buf, seq, enc) {
  return new Node(messages.Node.decode(buf), seq, enc)
}

Node.terminator = function (i) {
  return i > 0 && (i & 31) === 0
}

Node.normalizeKey = normalizeKey

function hash (keys) {
  const buf = Buffer.allocUnsafe(8 * keys.length)

  for (var i = 0; i < keys.length; i++) {
    const key = Buffer.from(keys[i])
    sodium.crypto_shorthash(i ? buf.slice(i * 8) : buf, key, KEY)
  }

  return buf
}

function split (key) {
  const list = key.split('/')
  if (list[0] === '') list.shift()
  if (list[list.length - 1] === '') list.pop()
  return list
}

function normalizeKey (key) {
  if (!key.length) return ''
  return key[0] === '/' ? key.slice(1) : key
}

function defaultStylize (val) {
  return val
}
