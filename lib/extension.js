const MAX_ACTIVE = 32
const FLUSH_BATCH = 128
const MAX_PASSIVE_BATCH = 2048
const MAX_ACTIVE_BATCH = MAX_PASSIVE_BATCH + FLUSH_BATCH

const { Extension } = require('./messages')

class Batch {
  constructor (outgoing, from) {
    this.blocks = []
    this.start = 0
    this.end = 0
    this.outgoing = outgoing
    this.from = from
  }

  push (seq) {
    const len = this.blocks.push(seq)
    if (len === 1 || seq < this.start) this.start = seq
    if (len === 1 || seq >= this.end) this.end = seq + 1
    if (len >= FLUSH_BATCH) {
      this.send()
      this.clear()
    }
  }

  send () {
    if (!this.blocks.length) return
    this.outgoing.send(Extension.encode({ cache: { blocks: this.blocks, start: this.start, end: this.end } }), this.from)
  }

  clear () {
    this.start = this.end = 0
    this.blocks = []
  }
}

class HypertrieExtension {
  constructor (trie) {
    this.encoding = null
    this.outgoing = null
    this.trie = trie
    this.active = 0
  }

  onmessage (buf, from) {
    const message = decode(buf)

    if (!message) return
    if (message.cache) this.oncache(message.cache, from)
    if (message.iterator) this.oniterator(message.iterator, from)
    if (message.get) this.onget(message.get, from)
  }

  get (head, key) {
    this.outgoing.broadcast(Extension.encode({ get: { head, key } }))
  }

  iterator (head, key, flags, checkpoint) {
    this.outgoing.broadcast(Extension.encode({ iterator: { head, key, flags, checkpoint } }))
    return MAX_PASSIVE_BATCH
  }

  oncache (message, from) {
    if (!message.blocks.length) return
    if (message.blocks.length > MAX_ACTIVE_BATCH) message.blocks = message.blocks.slice(0, MAX_ACTIVE_BATCH)

    this.trie.feed.download(message)
  }

  oniterator (message, from) {
    if (message.key === null && !message.checkpoint) return

    if (this.active >= MAX_ACTIVE) return
    this.active++
    this.trie.emit('extension-iterator', message.key)

    const self = this
    let total = 0

    const checkpointed = !!message.checkpoint
    const b = new Batch(this.outgoing, from)
    const ite = message.key
      ? this.trie.checkout(message.head + 1).iterator(message.key, { extension: false, wait: false, onseq })
      : this.trie.iterator({ extension: false, wait: false, checkpoint: message.checkpoint, onseq })

    ite.next(onnext)

    function onseq (seq) {
      if (checkpointed && !ite.opened) return
      total++
      b.push(seq)
    }

    function onnext (err, node) {
      if (err || node === null || total >= MAX_ACTIVE_BATCH) {
        self.active--
        b.send()
      } else {
        ite.next(onnext)
      }
    }
  }

  onget (message, from) {
    if (!message.key) return

    if (this.active >= MAX_ACTIVE) return
    this.active++
    this.trie.emit('extension-get', message.key)

    const self = this
    const b = new Batch(this.outgoing, from)
    this.trie.checkout(message.head + 1).get(message.key, { extension: false, wait: false, onseq }, ondone)

    function onseq (seq) {
      b.push(seq)
    }

    function ondone () {
      self.active--
      b.send()
    }
  }
}

HypertrieExtension.BATCH_SIZE = MAX_PASSIVE_BATCH

module.exports = HypertrieExtension

function decode (buf) {
  try {
    return Extension.decode(buf)
  } catch (err) {
    return null
  }
}
