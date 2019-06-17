const tape = require('tape')
const create = require('./helpers/create')

tape('closest put node is a prefix', function (t) {
  t.plan(4)

  const db = create()

  db.put('a', 'hello', err => {
    t.error(err, 'no error')
    db.put('b', 'goodbye', err => {
      t.error(err, 'no error')
      db.put('a/b', 'something', {
        closest: true,
        condition: (closest, newNode, cb) => {
          t.same(closest.key, 'a')
          return cb(null, true)
        }
      }, err => {
        t.error(err, 'no error')
      })
    })
  })
})

tape('closest put node is a prefix, batch insertion with flags', function (t) {
  t.plan(3)

  const db = create()

  db.batch([
    { type: 'put', key: 'a', value: 'hello', flags: 1 },
    { type: 'put', key: 'b', value: 'goodbye' }
  ], err => {
    t.error(err, 'no error')
    db.put('a/b', 'something', {
      closest: true,
      condition: (closest, newNode, cb) => {
        t.same(closest.key, 'a')
        return cb(null, true)
      }
    }, err => {
      t.error(err, 'no error')
    })
  })
})

tape('closest node to non-existing delete path is a prefix', function (t) {
  t.plan(4)

  const db = create()

  db.batch([
    { type: 'put', key: 'a', value: 'hello' },
    { type: 'put', key: 'b', value: 'goodbye' },
    { type: 'put', key: 'a/a', value: 'world' },
    { type: 'put', key: 'b/a', value: 'dog' },
    { type: 'put', key: 'b/b', value: 'otter' }
  ], err => {
    t.error(err, 'no error')
    db.del('a/a/b', {
      closest: true,
      condition: (closest, cb) => {
        t.same(closest.key, 'a/a')
        return cb(null, true)
      }
    }, (err, node) => {
      t.error(err, 'no error')
      t.false(node)
    })
  })
})

// TODO: Fix this issue.
tape.skip('closest node with one hidden node', function (t) {
  t.plan(3)

  const db = create()

  db.put('a', 'hello', { hidden: true }, err => {
    t.error(err, 'no error')
    db.get('b', { closest: true }, (err, node) => {
      t.error(err, 'no error')
      t.false(node)
    })
  })
})
