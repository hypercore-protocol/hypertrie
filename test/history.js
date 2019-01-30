const tape = require('tape')
const create = require('./helpers/create')

tape('basic history', function (t) {
  const db = create()

  db.put('hello', 'world', function (err) {
    t.error(err, 'no error')

    const ite = db.history()

    ite.next(function (err, data) {
      t.error(err, 'no error')
      t.same(data.key, 'hello')
      t.same(data.value, 'world')
    })
    ite.next(function (err, data) {
      t.error(err, 'no error')
      t.same(data, null)
      t.end()
    })
  })
})

tape('multiple entries history', function (t) {
  const db = create()

  db.put('hello', 'hi', function (err) {
    t.error(err, 'no error')
    db.put('hi', 'ho', function (err) {
      t.error(err, 'no error')
      db.put('hello', 'world', function (err) {
        t.error(err, 'no error')

        const ite = db.history()

        ite.next(function (err, data) {
          t.error(err, 'no error')
          t.same(data.key, 'hello')
          t.same(data.value, 'hi')
        })
        ite.next(function (err, data) {
          t.error(err, 'no error')
          t.same(data.key, 'hi')
          t.same(data.value, 'ho')
        })
        ite.next(function (err, data) {
          t.error(err, 'no error')
          t.same(data.key, 'hello')
          t.same(data.value, 'world')
        })
        ite.next(function (err, data) {
          t.error(err, 'no error')
          t.same(data, null)
          t.end()
        })
      })
    })
  })
})
