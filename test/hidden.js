const tape = require('tape')
const create = require('./helpers/create')

tape('hidden put is hidden', function (t) {
  const db = create()

  db.put('hello', 'world', { hidden: true }, function (err) {
    t.error(err, 'no error')
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node, null)
      db.get('hello', { hidden: true }, function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'world')
        t.end()
      })
    })
  })
})

tape('hidden and non hidden do not collide', function (t) {
  const db = create()

  db.put('hello', 'hidden', { hidden: true }, function (err) {
    t.error(err, 'no error')
    db.put('hello', 'not hidden', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'not hidden')
        db.get('hello', { hidden: true }, function (err, node) {
          t.error(err, 'no error')
          t.same(node.value, 'hidden')
          t.end()
        })
      })
    })
  })
})

tape('batch hidden and non hidden do not collide', function (t) {
  const db = create()

  db.batch([
    { type: 'put', key: 'hello', value: 'hidden', hidden: true },
    { type: 'put', key: 'hello', value: 'not hidden' }
  ], function (err) {
    t.error(err, 'no error')
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, 'not hidden')
      db.get('hello', { hidden: true }, function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'hidden')
        t.end()
      })
    })
  })
})

tape('put 4 non hidden and one hidden', function (t) {
  const db = create()

  db.put('a', 'a', function () {
    db.put('hello', 'hello', { hidden: true }, function () {
      db.put('b', 'b', function () {
        db.put('c', 'c', function () {
          db.put('d', 'd', function () {
            db.get('hello', { hidden: true }, function (err, node) {
              t.error(err, 'no error')
              t.same(node.value, 'hello')
              t.end()
            })
          })
        })
      })
    })
  })
})

tape('hidden iterators', function (t) {
  const db = create()

  db.batch([
    { type: 'put', key: 'a', value: 'a' },
    { type: 'put', key: 'hello', value: 'hello', hidden: true },
    { type: 'put', key: 'b', value: 'b' },
    { type: 'put', key: 'c', value: 'c' },
    { type: 'put', key: 'world', value: 'world', hidden: true },
    { type: 'put', key: 'd', value: 'd' }
  ], function (err) {
    t.error(err, 'no error')
    db.list(function (err, nodes) {
      t.error(err, 'no error')
      const values = nodes.map(n => n.value).sort()
      t.same(values, [ 'a', 'b', 'c', 'd' ])
      db.list('', { hidden: true }, function (err, nodes) {
        t.error(err, 'no error')
        const values = nodes.map(n => n.value).sort()
        t.same(values, [ 'hello', 'world' ])
        t.end()
      })
    })
  })
})

tape('hidden deletes', function (t) {
  t.plan(4)

  const db = create()

  db.put('a', 'a', { hidden: true }, function () {
    db.put('a', 'b', function () {
      db.del('a', { hidden: true }, function () {
        db.get('a', function (err, node) {
          t.error(err, 'no error')
          t.same(node.value, 'b')
        })
        db.get('a', { hidden: true }, function (err, node) {
          t.error(err, 'no error')
          t.same(node, null)
        })
      })
    })
  })
})
