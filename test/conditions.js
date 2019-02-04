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
        t.same(node, null)
        t.end()
      })
    })
  }

  function deleteGuard (value) {
    return function (node, cb) {
      if (node === value) return cb(null, true)
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
