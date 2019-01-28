const tape = require('tape')
const create = require('./helpers/create')

const messages = require('../lib/messages')

tape('basic delete', function (t) {
  const db = create()

  db.put('hello', 'world', function () {
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, 'world')
      db.del('hello', function (err) {
        t.error(err, 'no error')
        db.get('hello', function (err, node) {
          t.error(err, 'no error')
          t.ok(!node, 'was deleted')

          db.iterator().next(function (err, node) {
            t.error(err, 'no error')
            t.ok(!node, 'db is empty')
            t.end()
          })
        })
      })
    })
  })
})

tape('delete one in many', function (t) {
  t.plan(1 + 2 + 2 + 2)

  const db = create()
  const batch = []

  for (var i = 0; i < 50; i++) {
    batch.push({key: '' + i, value: '' + i})
  }

  db.batch(batch, function () {
    db.del('42', done)
  })

  function done (err) {
    t.error(err, 'no error')
    db.get('42', function (err, node) {
      t.error(err, 'no error')
      t.ok(!node, 'was deleted')
    })
    db.get('43', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, '43')
    })
    db.get('15', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, '15')
    })
  }
})

tape('delete one in many (iteration)', function (t) {
  const db = create()
  const batch = []

  for (var i = 0; i < 50; i++) {
    batch.push({key: '' + i, value: '' + i})
  }

  const keys = batch.map(b => b.key)

  db.batch(batch, function () {
    db.del('42', done)
  })

  function done (err) {
    t.error(err, 'no error')

    const ite = db.iterator()
    const actual = []

    ite.next(function loop (err, node) {
      if (err) return t.error(err, 'no error')

      if (!node) {
        const expected = keys.slice(0, 42).concat(keys.slice(43))
        t.same(actual.sort(), expected.sort(), 'all except deleted one')
        t.end()
        return
      }

      actual.push(node.value)
      ite.next(loop)
    })
  }
})

tape('delete many in many (iteration)', function (t) {
  const db = create()
  const batch = []

  for (var i = 0; i < 50; i++) {
    batch.push({key: '' + i, value: '' + i})
  }

  const keys = batch.map(b => b.key)

  db.batch(batch, function () {
    const dels = batch.slice(0, 25).map(toDel)
    db.batch(dels, done)
  })

  function done (err) {
    t.error(err, 'no error')

    const ite = db.iterator()
    const actual = []

    ite.next(function loop (err, node) {
      if (err) return t.error(err, 'no error')

      if (!node) {
        const expected = keys.slice(25)
        t.same(actual.sort(), expected.sort(), 'all except deleted ones')
        t.end()
        return
      }

      actual.push(node.value)
      ite.next(loop)
    })
  }
})

tape('deletion with a single record, and a valueEncoding', function (t) {
  const db = create(null, { valueEncoding: messages.Header })

  db.put('hello', { type: 'some-type' }, function (err) {
    t.error(err, 'no error')
    db.del('hello', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, val) {
        t.error(err, 'no error')
        t.same(val, null)
        t.end()
      })
    })
  })
})

function toDel (e) {
  return {
    type: 'del',
    key: e.key
  }
}
