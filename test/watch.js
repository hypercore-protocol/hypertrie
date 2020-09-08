const tape = require('tape')
const create = require('./helpers/create')

tape('basic watch', function (t) {
  const db = create()

  db.watch(function () {
    t.pass('watch triggered')
    t.end()
  })

  db.put('hello', 'world')
})

tape('watch prefix', function (t) {
  const db = create()
  var changed = false

  db.watch('foo', function () {
    t.ok(changed)
    t.end()
  })

  db.put('hello', 'world', function (err) {
    t.error(err)
    setImmediate(function () {
      changed = true
      db.put('foo/bar', 'baz')
    })
  })
})

tape('recursive watch', function (t) {
  t.plan(20)

  const db = create()
  var i = 0

  db.watch('foo', function () {
    if (i === 20) return
    t.pass('watch triggered')
    db.put('foo', 'bar-' + (++i))
  })

  db.put('foo', 'bar')
})

tape('watch and stop watching', function (t) {
  const db = create()
  var once = true

  const w = db.watch('foo', function () {
    t.ok(once)
    once = false
    w.destroy()
    db.put('foo/bar/baz', 'qux', function () {
      t.end()
    })
  })

  db.put('foo/bar', 'baz')
})

tape('watch, watch and stop watch first one', function (t) {
  t.plan(5 + 1)

  const db = create()
  var bs = 5

  db.ready(function () {
    const clone = create(db.key, { sparse: true })

    const a = clone.watch('foo', function () {
      t.pass('got a update')
      a.destroy()
    })

    const b = clone.watch('foo', function () {
      t.pass('got b update')

      if (!--bs) {
        b.destroy()
        t.end()
        return
      }

      db.put('foo/bar', 'baz')
    })

    db.put('foo/bar', 'baz')

    const stream = db.replicate(true, { live: true })
    stream.pipe(clone.replicate(false, { live: true })).pipe(stream)
  })
})

tape('remote watch', function (t) {
  const db = create()

  db.ready(function () {
    const clone = create(db.key)

    for (var i = 0; i < 100; i++) db.put('hello-' + i, 'world-' + i)
    db.put('flush', 'flush', function () {
      clone.watch(function () {
        t.pass('remote watch triggered')
        t.end()
      })

      const stream = db.replicate(true)
      stream.pipe(clone.replicate(false)).pipe(stream)
    })
  })
})

tape('remote watch with sparse mode and live replication', function (t) {
  const db = create(null, { sparse: true })

  db.ready(function () {
    const clone = create(db.key, { alwaysUpdate: true, sparse: true })
    // The ready triggers an update, which we do not want to trigger a watch event, so we must call this first.
    clone.ready(function () {
      const stream = db.replicate(true, { live: true })
      stream.pipe(clone.replicate(false, { live: true })).pipe(stream)

      var watcher = clone.watch(function () {
        t.pass('remote watch triggered')
        watcher.destroy()
        t.end()
      })

      setTimeout(function () {
        db.put('hello', 'world')
      }, 50)
    })
  })
})
