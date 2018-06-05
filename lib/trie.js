const varint = require('varint')

exports.encode = function (trie) {
  const buf = Buffer.alloc(65536)
  var i, j
  var offset = 0

  varint.encode(trie.length, buf, offset)
  offset += varint.encode.bytes

  for (i = 0; i < trie.length; i++) {
    const bucket = trie[i]
    if (!bucket) continue

    var bit = 1
    var bitfield = 0

    varint.encode(i, buf, offset)
    offset += varint.encode.bytes

    for (j = 0; j < bucket.length; j++) {
      const seq = bucket[j]
      if (seq) bitfield |= bit
      bit *= 2
    }

    varint.encode(bitfield, buf, offset)
    offset += varint.encode.bytes

    for (j = 0; j < bucket.length; j++) {
      const seq = bucket[j]
      if (seq) {
        varint.encode(seq, buf, offset)
        offset += varint.encode.bytes
      }
    }
  }

  return buf.slice(0, offset)
}

exports.decode = function (buf) {
  var offset = 0

  const len = varint.decode(buf, offset)
  offset += varint.decode.bytes

  const trie = new Array(len)

  while (offset < buf.length) {
    const i = varint.decode(buf, offset)
    offset += varint.decode.bytes

    var bitfield = varint.decode(buf, offset)
    var pos = 0

    const bucket = trie[i] = new Array(32 - Math.clz32(bitfield))
    offset += varint.decode.bytes

    while (bitfield) {
      const bit = bitfield & 1

      if (bit) {
        bucket[pos] = varint.decode(buf, offset)
        offset += varint.decode.bytes
      }

      bitfield = (bitfield - bit) / 2
      pos++
    }
  }

  return trie
}
