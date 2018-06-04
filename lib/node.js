const sodium = require('sodium-universal')
const messages = require('./messages')
const trie = require('./trie')

const KEY = Buffer.alloc(16)

module.exports = Node

function Node (data) {
  this.seq = data.seq || 0
  this.key = data.key
  this.value = data.value || null
  this.hash = hash(this.key)
  this.trie = data.trieBuffer ? trie.decode(data.trieBuffer) : (data.trie || [])
  this.trieBuffer = data.trieBuffer
  this.length = this.hash.length * 4 + 1
}

Node.prototype.path = function (i) {
  const hash = this.hash
  if (i >= hash.length * 4) return 4
  return (hash[i >> 2] >> (2 * (i & 3))) & 3
}

Node.prototype.encode = function () {
  this.trieBuffer = trie.encode(this.trie)
  return messages.Node.encode(this)  
}

Node.decode = function (buf, seq) {
  return new Node(messages.Node.decode(buf))
}

function hash (key) {
  const buf = Buffer.alloc(8)
  sodium.crypto_shorthash(buf, Buffer.from(key), KEY)
  return buf
}
