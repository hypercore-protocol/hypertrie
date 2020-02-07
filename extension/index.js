const MAX_ACTIVE = 32
const FLUSH_BATCH = 128
const MAX_PASSIVE_BATCH = 2048
const MAX_ACTIVE_BATCH = MAX_PASSIVE_BATCH + FLUSH_BATCH

const { Message } = require('./message')

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
    this.outgoing.send(Message.encode({ cache: { blocks: this.blocks, start: this.start, end: this.end } }), this.from)
  }

  clear () {
    this.start = this.end = 0
    this.blocks = []
  }
}

module.exports = class HypertrieExtension {
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

  get (key, head) {
    this.outgoing.broadcast(Message.encode({ get: { key, head } }))
  }

  iterator (key, head, checkpoint) {
    this.outgoing.broadcast(Message.encode({ iterator: { key, head, checkpoint } }))
    return MAX_PASSIVE_BATCH
  }

  oncache (message, from) {
    // TODO: expand selection api to support .download({start, end, blocks})
    const blocks = message.blocks
    if (!blocks) return
    const len = Math.min(blocks.length, MAX_ACTIVE_BATCH)

    for (let i = 0; i < len; i++) {
      const seq = blocks[i]
      this.trie.feed.download(seq)
    }
  }

  oniterator (message, from) {
    if (!message.key && !message.checkpoint) return

    if (this.active >= MAX_ACTIVE) return
    this.active++

    const self = this
    let skip = 0
    let total = 0

    const b = new Batch(this.outgoing, from)
    const ite = message.key
      ? this.trie.checkout(message.head).iterator(message.key, { extension: false, wait: false, onseq })
      : this.trie.iterator({ extension: false, wait: false, checkpoint: message.checkpoint, onseq })

    ite.next(onnext)
    skip = ite._stack.length // do send back seqs the client already knows, ie anything in the batch in the first tick

    function onseq (seq) {
      if (skip > 0) {
        skip--
      } else {
        total++
        b.push(seq)
      }
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

    const self = this
    const b = new Batch(this.outgoing, from)
    this.trie.checkout(message.head).get(message.key, { extension: false, wait: false, onseq }, ondone)

    function onseq (seq) {
      b.push(seq)
    }

    function ondone () {
      self.active--
      b.send()
    }
  }
}

function decode (buf) {
  try {
    return Message.decode(buf)
  } catch (err) {
    return null
  }
}
