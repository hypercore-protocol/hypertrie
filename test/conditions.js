const tape = require('tape')
const create = require('./helpers/create')

tape('condition: put only if changed', function (t) {
  const db = create()
  db.put('hello', 'world', { condition: onlyIfChanged }, err => {
    t.error(err, 'no error')
    db.put('hello', 'world', { condition: onlyIfChanged }, err => {
      t.error(err, 'no error')
      t.same(db.version, 2)
      t.end()
    })
  })

  function onlyIfChanged (oldNode, newNode, cb) {
    if (!oldNode) return cb(null, true)
    if (oldNode && !newNode) return cb(new Error('Cannot insert a null value (use delete)'))
    if (oldNode.value === newNode.value) return cb(null, false)
    return cb(null, true)
  }
})

tape('condition: put only if the value is null', function (t) {
  const db = create()
  db.put('hello', 'world', { condition: onlyIfNull }, err => {
    t.error(err, 'no error')
    db.put('hello', 'friend', { condition: onlyIfNull }, err => {
      t.error(err, 'no error')
      t.same(db.version, 2)
      t.end()
    })
  })

  function onlyIfNull (oldNode, newNode, cb) {
    if (!newNode) return cb(new Error('Cannot insert a null value (use delete)'))
    if (oldNode) return cb(null, false)
    return cb(null, true)
  }
})

tape('condition: put only if value is null, nested paths', function (t) {
  const db = create()
  db.put('/a/b', 'world', { condition: onlyIfNull }, err => {
    t.error(err, 'no error')
    db.put('/a/b/c', 'friend', { condition: onlyIfNull }, err => {
      t.error(err, 'no error')
      t.same(db.version, 3)
      t.end()
    })
  })

  function onlyIfNull (oldNode, newNode, cb) {
    if (!newNode) return cb(new Error('Cannot insert a null value (use delete)'))
    if (oldNode) return cb(null, false)
    return cb(null, true)
  }
})

tape('condition: two keys with same siphash', function (t) {
  const db = create()
  var pending = 2

  db.put('idgcmnmna', 'a', function () {
    db.put('mpomeiehc', 'b', { condition: onlyIfNull }, function (err) {
      t.error(err, 'no error')
      t.same(db.version, 3)
      testKey('idgcmnmna', ifValueMatches('a'))
      testKey('mpomeiehc', ifValueMatches('b'))
    })
  })

  function testKey (key, condition) {
    db.put(key, 'c', { condition }, function (err) {
      t.error(err, 'no error')
      db.get(key, function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'c')
        if (!--pending) return t.end()
      })
    })
  }

  function ifValueMatches (val) {
    return function (oldNode, newNode, cb) {
      if (oldNode && oldNode.value === val) return cb(null, true)
      return cb(null, false)
    }
  }

  function onlyIfNull (oldNode, newNode, cb) {
    if (!newNode) return cb(new Error('Cannot insert a null value (use delete)'))
    if (oldNode) return cb(null, false)
    return cb(null, true)
  }
})

tape('condition: delete only a certain value', function (t) {
  const db = create()
  db.put('hello', 'world', err => {
    t.error(err, 'no error')
    db.del('hello', { condition: deleteGuard('friend') }, err => {
      t.error(err, 'no error')
      db.get('hello', (err, node) => {
        t.error(err, 'no error')
        t.same(node.value, 'world')
        doDelete()
      })
    })
  })

  function doDelete () {
    db.del('hello', { condition: deleteGuard('world') }, err => {
      t.error(err, 'no error')
      db.get('hello', (err, node) => {
        t.error(err, 'no error')
        t.true(node === null)
        t.end()
      })
    })
  }

  function deleteGuard (value) {
    return function (node, cb) {
      if (node && node.value === value) return cb(null, true)
      return cb(null, false)
    }
  }
})

tape('condition: async condition', function (t) {
  const db = create()
  db.put('hello', 'world', { condition: afterWork }, err => {
    t.error(err, 'no error')
    db.put('hello', 'world', { condition: afterWork }, err => {
      t.error(err, 'no error')
      t.same(db.version, 3)
      db.get('hello', (err, node) => {
        t.error(err, 'no error')
        t.same(node.value, 'world')
        t.end()
      })
    })
  })

  function afterWork (oldNode, newNode, cb) {
    setTimeout(() => {
      return cb(null, true)
    }, 200)
  }
})

tape('condition: deletion closest with similar paths', function (t) {
  const db = create()
  db.put('a', 'hello world', err => {
    t.error(err, 'no error')
    db.del('a/b', { condition: closestGuard('a'), closest: true }, err => {
      t.true(err && err.closest, 'closest was a')
      db.get('a', (err, node) => {
        t.error(err, 'no error')
        t.same(node.value, 'hello world')
        t.end()
      })
    })
  })

  function closestGuard (key) {
    return function (closest, cb) {
      if (closest && closest.key === key) {
        const err = new Error('Closest key was incorrect')
        err.closest = true
        return cb(err)
      }
      return cb(null, true)
    }
  }
})

tape('condition: deletion closest with multiple hops', function (t) {
  const db = create()
  db.put('a', 'hello world', err => {
    t.error(err, 'no error')
    db.put('b', 'blah', err => {
      t.error(err, 'no error')
      db.del('a/b', { condition: closestGuard('a'), closest: true }, err => {
        t.true(err && err.closest, 'closest was a')
        db.get('a', (err, node) => {
          t.error(err, 'no error')
          t.same(node.value, 'hello world')
          t.end()
        })
      })
    })
  })

  function closestGuard (key) {
    return function (closest, cb) {
      if (closest && closest.key === key) {
        const err = new Error('Closest key was incorrect')
        err.closest = true
        return cb(err)
      }
      return cb(null, true)
    }
  }
})
