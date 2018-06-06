const sodium = require('sodium-universal')
const messages = require('./messages')
const trie = require('./trie')

const KEY = Buffer.alloc(16)

module.exports = Node

function Node (data, seq, enc) {
  this.seq = seq || 0
  this.key = data.key
  this.value = data.value || ((data.valueBuffer && enc) ? enc.decode(data.valueBuffer) : null)
  this.hash = hash(this.key)
  this.trie = data.trieBuffer ? trie.decode(data.trieBuffer) : (data.trie || [])
  this.trieBuffer = null
  this.valueBuffer = null
  this.length = this.hash.length * 4 + 1
  this.valueEncoding = enc
}

Node.prototype.path = function (i) {
  const hash = this.hash
  if (i >= hash.length * 4) return 4
  return (hash[i >> 2] >> (2 * (i & 3))) & 3
}

Node.prototype.encode = function () {
  this.trieBuffer = trie.encode(this.trie)
  this.valueBuffer = this.valueEncoding ? this.valueEncoding.encode(this.value) : this.value
  return messages.Node.encode(this)
}

Node.decode = function (buf, seq, enc) {
  return new Node(messages.Node.decode(buf), seq, enc)
}

function hash (keys) {
  if (typeof keys === 'string') keys = split(keys)

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
