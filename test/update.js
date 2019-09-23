const tape = require('tape')
const create = require('./helpers/create')
const HypercoreProtocol = require('hypercore-protocol')

tape('get without alwaysUpdate returns null', t => {
  const trie1 = create()
  var trie2 = null

  trie1.ready(() => {
    trie2 = create(trie1.key)
    trie1.put('a', 'b', () => {
      trie2.get('a', (err, node) => {
        t.error(err, 'no error')
        t.same(node, null)
        t.end()
      })
    })
    replicate(trie1, trie2, { live: true })
  })
})

tape('get with alwaysUpdate will wait for an update', t => {
  const trie1 = create({ alwaysUpdate: true })
  var trie2 = null

  trie1.ready(() => {
    trie2 = create(trie1.key, { alwaysUpdate: true, valueEncoding: 'utf8' })
    trie1.put('a', 'b', () => {
      trie2.get('a', (err, node) => {
        t.error(err, 'no error')
        t.same(node.key, 'a')
        t.same(node.value, 'b')
        t.end()
      })
    })
    replicate(trie1, trie2, { live: true })
  })
})

tape('replication with an empty peer is not problematic', t => {
  const trie1 = create({ alwaysUpdate: true })
  const emptyPeer = {
    replicate: (isInitiator, opts) => {
      const stream = new HypercoreProtocol(isInitiator, { ...opts, live: true })
      stream.on('discovery-key', dkey => {
        stream.close(dkey)
      })
      return stream
    }
  }
  var trie2 = null

  trie1.ready(() => {
    trie2 = create(trie1.key, { alwaysUpdate: true, valueEncoding: 'utf8' })
    trie1.put('a', 'b', () => {
      trie2.get('a', (err, node) => {
        t.error(err, 'no error')
        t.same(node.key, 'a')
        t.same(node.value, 'b')
        t.end()
      })
    })
    replicate(trie1, trie2, { live: true })
    replicate(trie1, emptyPeer, { live: true })
  })
})

function replicate (trie1, trie2, opts) {
  const stream = trie1.replicate(true, opts)
  return stream.pipe(trie2.replicate(false, opts)).pipe(stream)
}
