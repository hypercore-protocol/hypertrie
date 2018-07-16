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

tape('two prefixes with same key', function (t) {
  const db = create()

  db.put('idgcmnmna/a', 'a', function () {
    db.put('mpomeiehc/a', 'a', function () {
      const ite = db.iterator({recursive: false})

      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'a')
      })
      ite.next(function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'a')
        t.end()
      })
    })
  })
})

tape('sorts based on key when colliding', function (t) {
  const db1 = create()
  const db2 = create()

  db1.batch([
    {key: 'idgcmnmna'},
    {key: 'mpomeiehc'},
    {key: 'a'},
    {key: 'b'},
    {key: 'c'}
  ], function () {
    db2.batch([
      {key: 'b'},
      {key: 'mpomeiehc'},
      {key: 'a'},
      {key: 'idgcmnmna'},
      {key: 'c'}
    ], function () {
      const i1 = db1.iterator()
      const i2 = db2.iterator()

      i1.next(function loop (err, n1) {
        t.error(err, 'no error')
        i2.next(function (err, n2) {
          t.error(err, 'no error')
          if (!n1 && !n2) return t.end()
          t.same(n1.key, n2.key)
          i1.next(loop)
        })
      })
    })
  })
})

tape('two keys with same siphash (diff)', function (t) {
  const db = create()

  db.batch([
    {key: 'idgcmnmna'},
    {key: 'mpomeiehc'},
    {key: 'a'},
    {key: 'b'},
    {key: 'c'}
  ], function () {
    const ite = db.diff(0)
    const found = {}

    ite.next(function loop (err, node) {
      t.error(err, 'no error')
      if (!node) {
        t.same(found, {
          idgcmnmna: true,
          mpomeiehc: true,
          a: true,
          b: true,
          c: true
        })
        return t.end()
      }
      found[node.key] = true
      ite.next(loop)
    })
  })
})
