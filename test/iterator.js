const tape = require('tape')
const create = require('./helpers/create')

tape('basic iteration', function (t) {
  const db = create()
  const vals = ['a', 'b', 'c']
  const expected = toMap(vals)

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator(), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('iterate a big db', function (t) {
  const db = create()
  const vals = range(1000, '#')
  const expected = toMap(vals)

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator(), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('prefix basic iteration', function (t) {
  var vals = ['foo/a', 'foo/b', 'foo/c']
  const db = create()
  const expected = toMap(vals)

  vals = vals.concat(['a', 'b', 'c'])

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator('foo'), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('empty prefix iteration', function (t) {
  const db = create()
  const vals = ['foo/a', 'foo/b', 'foo/c']
  const expected = {}

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator('bar'), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('prefix iterate a big db', function (t) {
  var vals = range(1000, 'foo/#')
  const db = create()
  const expected = toMap(vals)

  vals = vals.concat(range(1000, '#'))

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator('foo'), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('non recursive iteration', function (t) {
  const db = create()
  const vals = [
    'a',
    'a/b/c/d',
    'a/c',
    'b',
    'b/b/c',
    'c/a',
    'c'
  ]

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator({recursive: false}), function (err, map) {
      t.error(err, 'no error')
      const keys = Object.keys(map).map(k => k.split('/')[0])
      t.same(keys.sort(), ['a', 'b', 'c'], 'iterated all values')
      t.end()
    })
  })
})

tape('mixed nested and non nexted iteration', function (t) {
  const db = create()
  const vals = ['a', 'a/a', 'a/b', 'a/c', 'a/a/a', 'a/a/b', 'a/a/c']
  const expected = toMap(vals)

  put(db, vals, function (err) {
    t.error(err, 'no error')
    all(db.iterator(), function (err, map) {
      t.error(err, 'no error')
      t.same(map, expected, 'iterated all values')
      t.end()
    })
  })
})

tape('list buffers an iterator', function (t) {
  const db = create()

  put(db, ['a', 'b', 'b/c'], function (err) {
    t.error(err, 'no error')
    db.list(function (err, all) {
      t.error(err, 'no error')
      t.same(all.map(v => v.key).sort(), ['a', 'b', 'b/c'])
      db.list('b', {gt: true}, function (err, all) {
        t.error(err, 'no error')
        t.same(all.length, 1)
        t.same(all[0].key, 'b/c')
        t.end()
      })
    })
  })
})

function range (n, v) {
  // #0, #1, #2, ...
  return new Array(n).join('.').split('.').map((a, i) => v + i)
}

function toMap (list) {
  const map = {}
  for (var i = 0; i < list.length; i++) {
    map[list[i]] = list[i]
  }
  return map
}

function all (ite, cb) {
  const vals = {}

  ite.next(function loop (err, node) {
    if (err) return cb(err)
    if (!node) return cb(null, vals)
    const key = Array.isArray(node) ? node[0].key : node.key
    if (vals[key]) return cb(new Error('duplicate node for ' + key))
    vals[key] = Array.isArray(node) ? node.map(n => n.value).sort() : node.value
    ite.next(loop)
  })
}

function put (db, vals, cb) {
  db.batch(vals.map(v => ({key: v, value: v})), cb)
}
