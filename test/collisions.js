const tape = require('tape')
const create = require('./helpers/create')

tape('two keys with same siphash', function (t) {
  t.plan(2 + 2)

  const db = create()

  db.put('idgcmnmna', 'a', function () {
    db.put('mpomeiehc', 'b', function () {
      db.get('idgcmnmna', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'a')
      })
      db.get('mpomeiehc', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'b')
      })
    })
  })
})

tape('two keys with same siphash batch', function (t) {
  t.plan(1 + 3 * 2)

  const db = create()

  db.batch([
    {key: 'idgcmnmna', value: 'a'},
    {key: 'mpomeiehc', value: 'b'},
    {key: 'foo', value: 'bar'}
  ], function (err) {
    t.error(err, 'no error')
    db.get('idgcmnmna', same('a'))
    db.get('mpomeiehc', same('b'))
    db.get('foo', same('bar'))
  })

  function same (v) {
    return function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, v)
    }
  }
})

tape('two keys with same siphash (iterator)', function (t) {
  const db = create()

  db.put('idgcmnmna', 'a', function () {
    db.put('mpomeiehc', 'b', function () {
      const ite = db.iterator()

      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'a')
      })
      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'b')
      })
      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node, null)
        t.end()
      })
    })
  })
})

tape('two prefixes with same siphash (iterator)', function (t) {
  const db = create()

  db.put('idgcmnmna/a', 'a', function () {
    db.put('mpomeiehc/b', 'b', function () {
      const ite = db.iterator('idgcmnmna')

      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'a')
      })
      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node, null)
        t.end()
      })
    })
  })
})
