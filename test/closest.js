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

tape('closest node with one hidden node', function (t) {
  t.plan(3)

  const db = create()

  db.put('a', 'hello', { hidden: true }, err => {
    t.error(err, 'no error')
    db.get('b', { closest: true }, (err, node) => {
      console.log('node:', node)
      t.error(err, 'no error')
      t.false(node)
    })
  })
})
