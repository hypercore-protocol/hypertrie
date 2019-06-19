const tape = require('tape')
const collect = require('stream-collector')
const create = require('./helpers/create')
const cmp = require('compare')

tape('empty diff', function (t) {
  const db = create()

  const rs = db.createDiffStream(0, 'a')
  collect(rs, function (err, actual) {
    t.error(err, 'no error')
    t.deepEqual(actual, [], 'diff as expected')
    t.end()
  })
})

tape('implicit checkout', function (t) {
  const db = create()

  db.put('a', '2', function (err) {
    t.error(err, 'no error')
    const rs = db.createDiffStream(0, 'a')
    collect(rs, function (err, actual) {
      t.error(err, 'no error')
      t.equals(actual.length, 1)
      t.equals(actual[0].key, 'a')
      t.equals(actual[0].left.key, 'a')
      t.equals(actual[0].left.value, '2')
      t.equals(actual[0].right, null)
      t.end()
    })
  })
})

tape('new value', function (t) {
  const db = create()

  db.put('a', '1', function (err) {
    t.error(err, 'no error')
    db.put('a', '2', function (err) {
      t.error(err, 'no error')
      const rs = db.createDiffStream(0, 'a')
      collect(rs, function (err, actual) {
        t.error(err, 'no error')
        t.equals(actual.length, 1)
        t.equals(actual[0].key, 'a')
        t.equals(actual[0].left.value, '2')
        t.equals(actual[0].right, null)
        t.end()
      })
    })
  })
})

tape('two new nodes', function (t) {
  const db = create()

  db.put('a/foo', 'quux', function (err) {
    t.error(err, 'no error')
    db.put('a/bar', 'baz', function (err) {
      t.error(err, 'no error')
      const rs = db.createDiffStream(0, 'a')
      collect(rs, function (err, actual) {
        t.error(err, 'no error')
        actual.sort(sort)
        t.equals(actual.length, 2)
        t.equals(actual[0].key, 'a/bar')
        t.equals(actual[0].left.value, 'baz')
        t.equals(actual[0].right, null)
        t.equals(actual[1].key, 'a/foo')
        t.equals(actual[1].left.value, 'quux')
        t.equals(actual[1].right, null)
        t.end()
      })
    })
  })
})

tape('checkout === head', function (t) {
  const db = create()

  db.put('a', '2', function (err) {
    t.error(err, 'no error')
    const rs = db.createDiffStream(db, 'a')
    collect(rs, function (err, actual) {
      t.error(err, 'no error')
      t.equals(actual.length, 0)
      t.end()
    })
  })
})

tape('new value, twice', function (t) {
  const db = create()
  const snap = db.snapshot()

  db.put('/a', '1', function (err) {
    t.error(err, 'no error')
    db.put('/a', '2', function (err) {
      t.error(err, 'no error')
      const rs = db.createDiffStream(snap, 'a')
      collect(rs, function (err, actual) {
        t.error(err, 'no error')
        t.equals(actual.length, 1)
        t.equals(actual[0].left.key, 'a')
        t.equals(actual[0].left.value, '2')
        t.equals(actual[0].right, null)
        t.end()
      })
    })
  })
})

tape('untracked value', function (t) {
  const db = create()

  db.put('a', '1', function (err) {
    t.error(err, 'no error')
    const snap = db.snapshot()
    db.put('a', '2', function (err) {
      t.error(err, 'no error')
      db.put('b', '17', function (err) {
        t.error(err, 'no error')
        const rs = db.createDiffStream(snap, 'a')
        collect(rs, function (err, actual) {
          t.error(err, 'no error')
          t.equals(actual.length, 1)
          t.equals(actual[0].key, 'a')
          t.equals(actual[0].left.value, '2')
          t.equals(actual[0].right.value, '1')
          t.end()
        })
      })
    })
  })
})

tape('diff root', function (t) {
  const db = create()

  db.put('a', '1', function (err) {
    t.error(err, 'no error')
    const snap = db.snapshot()
    db.put('a', '2', function (err) {
      t.error(err, 'no error')
      db.put('b', '17', function (err) {
        t.error(err, 'no error')
        const rs = db.createDiffStream(snap)
        collect(rs, function (err, actual) {
          t.error(err, 'no error')
          actual.sort(sort)
          t.equals(actual.length, 2)
          t.equals(actual[0].key, 'a')
          t.equals(actual[0].left.value, '2')
          t.equals(actual[0].key, 'a')
          t.equals(actual[0].right.value, '1')
          t.equals(actual[1].key, 'b')
          t.equals(actual[1].left.value, '17')
          t.equals(actual[1].right, null)
          t.end()
        })
      })
    })
  })
})

tape('updated value', function (t) {
  const db = create()

  db.put('a/d/r', '1', function (err) {
    t.error(err, 'no error')
    const snap = db.snapshot()
    db.put('a/d/r', '3', function (err) {
      t.error(err, 'no error')
      const rs = db.createDiffStream(snap, 'a')
      collect(rs, function (err, actual) {
        t.error(err, 'no error')
        t.equals(actual.length, 1)
        t.equals(actual[0].key, 'a/d/r')
        t.equals(actual[0].left.value, '3')
        t.equals(actual[0].key, 'a/d/r')
        t.equals(actual[0].right.value, '1')
        t.end()
      })
    })
  })
})

tape('small diff on big db', function (t) {
  const db = create()
  var nodes = 0

  db.batch(range(10000), function (err) {
    t.error(err, 'no error')
    const snap = db.snapshot()
    db.put('42', '42*', function (err) {
      t.error(err, 'no error')
      const rs = db.createDiffStream(snap, {onnode})
      collect(rs, function (err, actual) {
        t.error(err, 'no error')
        t.equals(actual.length, 1)
        t.equals(actual[0].key, '42')
        t.equals(actual[0].left.value, '42*')
        t.equals(actual[0].key, '42')
        t.equals(actual[0].right.value, '42')
        t.ok(nodes < 50)
        t.end()
      })
    })
  })

  function onnode () {
    nodes++
  }
})

tape('diff on hidden', function (t) {
  const db = create()
  db.put('secret', 'hyper', { hidden: true }, err => {
    t.error(err, 'no error')
    db.put('public', 'knowledge', err => {
      t.error(err, 'no error')
      let secdiff = db.createDiffStream(0, { hidden: true })
      let pubdiff = db.createDiffStream(0)
      collect(secdiff, (err, actual) => {
        t.error(err, 'no error')
        t.equal(actual.length, 1)
        t.equal(actual[0].key, 'secret')
        collect(pubdiff, (err, actual) => {
          t.error(err, 'no error')
          t.equal(actual.length, 1)
          t.equal(actual[0].key, 'public')
          t.end()
        })
      })
    })
  })
})

tape('diff checkpoints', function (t) {
  const db = create()
  const batchSize = 20
  db.batch(range(100), function (err) {
    t.error(err, 'no error')
    start()
  })

  function start () {
    const snap = db.snapshot()
    let batches = []
    run(snap, 0, null, finish)

    function finish (err, data, checkpoint) {
      t.error(err, 'no error')
      if (data && data.length) batches.push(data)
      if (checkpoint) run(snap, 0, checkpoint, finish)
      else finalize()
    }

    function finalize () {
      t.equal(batches.length, 5, 'number of batches')
      const set = new Set()
      for (let batch of batches) {
        t.equal(batch.length, 20, 'batch size')
        batch.forEach(val => set.add(val))
      }
      t.equal(set.size, 100, 'no duplicate values')
      t.end()
    }
  }

  function run (db, from, checkpoint, cb) {
    const diff = db.diff(from, { checkpoint })
    const data = []
    diff.next(next)
    function next (err, msg) {
      if (err) finish(err)
      if (!msg) return finish(null, false)
      data.push(msg.key)
      if (data.length >= batchSize) finish(null, true)
      else diff.next(next)
    }

    function finish (err, hasMore) {
      t.error(err, 'no error')
      let newCheckpoint
      if (hasMore) newCheckpoint = diff.checkpoint()
      cb(null, data, newCheckpoint)
    }
  }
})

function range (n) {
  return Array(n).join('.').split('.').map((_, i) => '' + i).map(kv)
}

function kv (v) {
  return {type: 'put', key: v, value: v}
}

function sort (a, b) {
  var ak = (a.left || a.right).key
  var bk = (b.left || b.right).key
  return cmp(ak, bk)
}
