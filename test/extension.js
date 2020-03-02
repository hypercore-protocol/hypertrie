const tape = require('tape')
const create = require('./helpers/create')

tape('extension get', function (t) {
  t.plan(5)

  const db = create()

  db.on('extension-get', function () {
    t.pass('got extension message')
  })

  db.batch([
    { key: 'hi', value: 'hi' },
    { key: 'hi1', value: 'hi' },
    { key: 'hi2', value: 'hi' },
    { key: 'hi3', value: 'hi' },
    { key: 'hi4', value: 'hi' }
  ], function () {
    const clone = create(db.key, { alwaysUpdate: true, sparse: true })

    replicate(db, clone)

    clone.get('hi', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, 'hi')
      clone.get('hi', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'hi')
      })
    })
  })
})

tape('extension iterator', function (t) {
  t.plan(4)

  const db = create()

  db.on('extension-iterator', function () {
    t.pass('got extension message')
  })

  db.batch([
    { key: 'hi', value: 'hi' },
    { key: 'hi1', value: 'hi' },
    { key: 'hi2', value: 'hi' },
    { key: 'hi3', value: 'hi' },
    { key: 'hi4', value: 'hi' }
  ], function () {
    const clone = create(db.key, { alwaysUpdate: true, sparse: true })

    replicate(db, clone)

    const ite = clone.iterator()
    ite.next(function (err, data) {
      t.error(err, 'no error')
      t.ok(!!data, 'got data')

      clone.iterator().next(function () {
        t.pass('same iteration')
      })
    })
  })
})

tape('extension sparse mitm', function (t) {
  t.plan(1)

  const db = create()

  db.on('extension-get', function () {
    t.fail('got extension message')
  })

  db.batch([
    { key: 'hi', value: 'hi' },
    { key: 'hi1', value: 'hi' },
    { key: 'hi2', value: 'hi' },
    { key: 'hi3', value: 'hi' },
    { key: 'hi4', value: 'hi' }
  ], function () {
    const clone = create(db.key, { alwaysUpdate: true, sparse: true })
    const clone2 = create(db.key, { alwaysUpdate: true, sparse: true })

    clone.on('extension-get', function () {
      t.pass('got extension message')
    })

    replicate(db, clone)
    replicate(clone, clone2)

    clone.get('hi4', { extension: false }, function () {
      clone.feed.on('download', function () {
        t.fail('mitm downloading')
      })
      clone2.get('hi', () => {})
      clone2.iterator().next(() => {})
    })
  })
})

function replicate (a, b) {
  const s = a.replicate(true, { live: true })
  s.pipe(b.replicate(false, { live: true })).pipe(s)
}
