const sodium = require('sodium-universal')
const inspect = require('inspect-custom-symbol')
const messages = require('./messages')
const trie = require('./trie')

const KEY = Buffer.alloc(16)

module.exports = Node

function Node (data, seq, enc) {
  this.seq = seq || 0
  this.key = normalizeKey(data.key)
  this.value = data.value !== undefined ? data.value : ((data.valueBuffer && enc) ? enc.decode(data.valueBuffer) : data.valueBuffer)
  this.keySplit = split(this.key)
  this.hash = hash(this.keySplit)
  this.trie = data.trieBuffer ? trie.decode(data.trieBuffer) : (data.trie || [])
  this.trieBuffer = null
  this.valueBuffer = null
  this.length = this.hash.length * 4 + 1
  this.valueEncoding = enc
}

Node.prototype[inspect] = function (depth, opts) {
  return opts.stylize({seq: this.seq, key: this.key, value: this.value}, 'object')
}

Node.prototype.path = function (i) {
  const hash = this.hash
  const j = i >> 2
  if (j >= hash.length) return 4
  return (hash[j] >> (2 * (i & 3))) & 3
}

Node.prototype.encode = function () {
  this.trieBuffer = trie.encode(this.trie)
  this.valueBuffer = this.valueEncoding ? this.valueEncoding.encode(this.value) : this.value
  return messages.Node.encode(this)
}

Node.prototype.collides = function (node, i) {
  if (i === this.length - 1) return this.key !== node.key
  const j = Math.floor(i / 32)
  return this.keySplit[j] !== node.keySplit[j]
}

Node.prototype.terminator = function (i) {
  if (i === this.length - 1) return true
  return i > 0 && ((i + 1) & 31) === 0
}

Node.decode = function (buf, seq, enc) {
  return new Node(messages.Node.decode(buf), seq, enc)
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
