const tape = require('tape')
const create = require('./helpers/create')

tape('reconnecting', function (t) {
  const db = create()

  db.put('hello', 'world', function () {
    const clone = create(db.key, { sparse: true, alwaysUpdate: true, alwaysReconnect: true })

    const s = db.replicate(true, { live: true })

    s.pipe(clone.replicate(false, { live: true })).pipe(s)

    clone.on('reconnected', function () {
      clone.feed.on('download', function () {
        t.fail('should not need to download any data')
      })
      clone.get('hello', function (_, node) {
        t.same(node.value, 'verden')
        t.end()
      })
    })

    clone.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, 'world')

      db.batch([
        { key: 'hello', value: 'verden' },
        { key: 'foo', value: 'bar' },
        { key: 'bar', value: 'baz' },
        { key: 'baz', value: 'foo' }
      ], function (err) {
        t.error(err, 'no error')

        clone.get('baz', function (err, node) {
          t.error(err, 'no error')
          t.same(node.value, 'foo')
        })
      })
    })
  })
})

tape('reconnecting twice', function (t) {
  const db = create()

  db.put('hello', 'world', function () {
    const clone = create(db.key, { sparse: true, alwaysUpdate: true, alwaysReconnect: true })

    const s = db.replicate(true, { live: true })

    s.pipe(clone.replicate(false, { live: true })).pipe(s)

    clone.once('reconnected', function () {
      clone.get('hello', function (_, node) {
        t.same(node.value, 'verden')

        const puts = new Array(128)

        for (let i = 0; i < puts.length; i++) {
          puts[i] = { key: '#' + i, value: i }
        }

        db.batch(puts, function () {
          let dl = 0

          clone.once('reconnected', function () {
            t.ok(dl < puts.length / 2, 'small diff')
            t.ok(dl > 1, 'diff larger than one message')

            clone.feed.on('download', function () {
              t.fail('should not need to download any data')
            })

            clone.get('hello', function (_, node) {
              t.same(node.value, 'verden')
              t.end()
            })
          })

          clone.feed.on('download', function () {
            dl++
          })

          clone.get('baz', () => {})
        })
      })
    })

    clone.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, 'world')

      db.batch([
        { key: 'hello', value: 'verden' },
        { key: 'foo', value: 'bar' },
        { key: 'bar', value: 'baz' },
        { key: 'baz', value: 'foo' }
      ], function (err) {
        t.error(err, 'no error')
        clone.get('baz', () => {})
      })
    })
  })
})
