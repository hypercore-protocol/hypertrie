const tape = require('tape')
const create = require('./helpers/create')

tape('deletes preverses nearby flags', function (t) {
  const db = create()

  db.put('ho', 'hi', function () {
    db.put('hi', 'ho', { flags: 100 }, function () {
      db.del('ho', function () {
        db.get('hi', function (err, node) {
          t.error(err, 'no error')
          t.same(node.flags, 100)
          t.end()
        })
      })
    })
  })
})
