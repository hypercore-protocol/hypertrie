const tape = require('tape')
const create = require('./helpers/create')
const Readable = require('stream').Readable

tape('basic put/get', function (t) {
  const db = create()
  db.put('hello', 'world', function (err, node) {
    t.same(node.key, 'hello')
    t.same(node.value, 'world')
    t.error(err, 'no error')
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hello', 'same key')
      t.same(node.value, 'world', 'same value')
      t.end()
    })
  })
})

tape('get on empty db', function (t) {
  const db = create()

  db.get('hello', function (err, node) {
    t.error(err, 'no error')
    t.same(node, null, 'node is not found')
    t.end()
  })
})

tape('not found', function (t) {
  const db = create()
  db.put('hello', 'world', function (err) {
    t.error(err, 'no error')
    db.get('hej', function (err, node) {
      t.error(err, 'no error')
      t.same(node, null, 'node is not found')
      t.end()
    })
  })
})

tape('leading / is ignored', function (t) {
  t.plan(7)
  const db = create()
  db.put('/hello', 'world', function (err) {
    t.error(err, 'no error')
    db.get('/hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hello', 'same key')
      t.same(node.value, 'world', 'same value')
    })
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hello', 'same key')
      t.same(node.value, 'world', 'same value')
    })
  })
})

tape('multiple put/get', function (t) {
  t.plan(8)

  const db = create()

  db.put('hello', 'world', function (err) {
    t.error(err, 'no error')
    db.put('world', 'hello', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello', 'same key')
        t.same(node.value, 'world', 'same value')
      })
      db.get('world', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'world', 'same key')
        t.same(node.value, 'hello', 'same value')
      })
    })
  })
})

tape('overwrites', function (t) {
  const db = create()

  db.put('hello', 'world', function (err) {
    t.error(err, 'no error')
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hello', 'same key')
      t.same(node.value, 'world', 'same value')
      db.put('hello', 'verden', function (err) {
        t.error(err, 'no error')
        db.get('hello', function (err, node) {
          t.error(err, 'no error')
          t.same(node.key, 'hello', 'same key')
          t.same(node.value, 'verden', 'same value')
          t.end()
        })
      })
    })
  })
})

tape('put/gets namespaces', function (t) {
  t.plan(8)

  const db = create()

  db.put('hello/world', 'world', function (err) {
    t.error(err, 'no error')
    db.put('world', 'hello', function (err) {
      t.error(err, 'no error')
      db.get('hello/world', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello/world', 'same key')
        t.same(node.value, 'world', 'same value')
      })
      db.get('world', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'world', 'same key')
        t.same(node.value, 'hello', 'same value')
      })
    })
  })
})

tape('put in tree', function (t) {
  t.plan(8)

  const db = create()

  db.put('hello', 'a', function (err) {
    t.error(err, 'no error')
    db.put('hello/world', 'b', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello', 'same key')
        t.same(node.value, 'a', 'same value')
      })
      db.get('hello/world', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello/world', 'same key')
        t.same(node.value, 'b', 'same value')
      })
    })
  })
})

tape('put in tree reverse order', function (t) {
  t.plan(8)

  const db = create()

  db.put('hello/world', 'b', function (err) {
    t.error(err, 'no error')
    db.put('hello', 'a', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello', 'same key')
        t.same(node.value, 'a', 'same value')
      })
      db.get('hello/world', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello/world', 'same key')
        t.same(node.value, 'b', 'same value')
      })
    })
  })
})

tape('multiple put in tree', function (t) {
  t.plan(13)

  const db = create()

  db.put('hello/world', 'b', function (err) {
    t.error(err, 'no error')
    db.put('hello', 'a', function (err) {
      t.error(err, 'no error')
      db.put('hello/verden', 'c', function (err) {
        t.error(err, 'no error')
        db.put('hello', 'd', function (err) {
          t.error(err, 'no error')
          db.get('hello', function (err, node) {
            t.error(err, 'no error')
            t.same(node.key, 'hello', 'same key')
            t.same(node.value, 'd', 'same value')
          })
          db.get('hello/world', function (err, node) {
            t.error(err, 'no error')
            t.same(node.key, 'hello/world', 'same key')
            t.same(node.value, 'b', 'same value')
          })
          db.get('hello/verden', function (err, node) {
            t.error(err, 'no error')
            t.same(node.key, 'hello/verden', 'same key')
            t.same(node.value, 'c', 'same value')
          })
        })
      })
    })
  })
})

tape('insert 100 values and get them all', function (t) {
  const db = create()
  const max = 100
  var i = 0

  t.plan(3 * max)

  loop()

  function loop () {
    if (i === max) return validate()
    db.put('#' + i, '#' + (i++), loop)
  }

  function validate () {
    for (var i = 0; i < max; i++) {
      db.get('#' + i, same('#' + i))
    }
  }

  function same (key) {
    return function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, key, 'same key')
      t.same(node.value, key, 'same value')
    }
  }
})

tape('race works', function (t) {
  t.plan(40)

  var missing = 10
  const db = create()

  for (var i = 0; i < 10; i++) db.put('#' + i, '#' + i, done)

  function done (err) {
    t.error(err, 'no error')
    if (--missing) return
    for (var i = 0; i < 10; i++) same('#' + i)
  }

  function same (val) {
    db.get(val, function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, val, 'same key')
      t.same(node.value, val, 'same value')
    })
  }
})

tape('version', function (t) {
  const db = create()

  db.ready(function () {
    t.same(db.version, 1)
    db.put('hello', 'world', function () {
      t.same(db.version, 2)
      db.put('hello', 'verden', function () {
        t.same(db.version, 3)
        db.checkout(2).get('hello', function (err, node) {
          t.error(err, 'no error')
          t.same(node.value, 'world')
          t.end()
        })
      })
    })
  })
})

tape('basic batch', function (t) {
  t.plan(1 + 3 + 3)

  const db = create()

  db.batch([
    {key: 'hello', value: 'world'},
    {key: 'hej', value: 'verden'},
    {key: 'hello', value: 'welt'}
  ], function (err) {
    t.error(err, 'no error')
    db.get('hello', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hello')
      t.same(node.value, 'welt')
    })
    db.get('hej', function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, 'hej')
      t.same(node.value, 'verden')
    })
  })
})

tape('batch with del', function (t) {
  t.plan(1 + 1 + 3 + 2)

  const db = create()

  db.batch([
    {key: 'hello', value: 'world'},
    {key: 'hej', value: 'verden'},
    {key: 'hello', value: 'welt'}
  ], function (err) {
    t.error(err, 'no error')
    db.batch([
      {key: 'hello', value: 'verden'},
      {type: 'del', key: 'hej'}
    ], function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.key, 'hello')
        t.same(node.value, 'verden')
      })
      db.get('hej', function (err, node) {
        t.error(err, 'no error')
        t.same(node, null)
      })
    })
  })
})

tape('multiple batches', function (t) {
  t.plan(19)

  const db = create()

  db.batch([{
    type: 'put',
    key: 'foo',
    value: 'foo'
  }, {
    type: 'put',
    key: 'bar',
    value: 'bar'
  }], function (err, nodes) {
    t.error(err)
    t.same(2, nodes.length)
    same('foo', 'foo')
    same('bar', 'bar')
    db.batch([{
      type: 'put',
      key: 'foo',
      value: 'foo2'
    }, {
      type: 'put',
      key: 'bar',
      value: 'bar2'
    }, {
      type: 'put',
      key: 'baz',
      value: 'baz'
    }], function (err, nodes) {
      t.error(err)
      t.same(3, nodes.length)
      same('foo', 'foo2')
      same('bar', 'bar2')
      same('baz', 'baz')
    })
  })

  function same (key, val) {
    db.get(key, function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, key)
      t.same(node.value, val)
    })
  }
})

tape('createWriteStream', function (t) {
  t.plan(10)
  var db = create()
  var writer = db.createWriteStream()

  writer.write([{
    type: 'put',
    key: 'foo',
    value: 'foo'
  }, {
    type: 'put',
    key: 'bar',
    value: 'bar'
  }])

  writer.write({
    type: 'put',
    key: 'baz',
    value: 'baz'
  })

  writer.end(function (err) {
    t.error(err, 'no error')
    same('foo', 'foo')
    same('bar', 'bar')
    same('baz', 'baz')
  })

  function same (key, val) {
    db.get(key, function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, key)
      t.same(node.value, val)
    })
  }
})

tape('createWriteStream pipe', function (t) {
  t.plan(10)
  var index = 0
  const db = create()
  const writer = db.createWriteStream()
  const reader = new Readable({
    objectMode: true,
    read: function (size) {
      var value = (index < 1000) ? {
        type: 'put',
        key: 'foo' + index,
        value: index++
      } : null
      this.push(value)
    }
  })
  reader.pipe(writer)
  writer.on('finish', function (err) {
    t.error(err, 'no error')
    same('foo1', 1)
    same('foo50', 50)
    same('foo999', 999)
  })

  function same (key, val) {
    db.get(key, function (err, node) {
      t.error(err, 'no error')
      t.same(node.key, key)
      t.same(node.value, val)
    })
  }
})

tape('can insert falsy values', function (t) {
  t.plan(2 * 2 + 3 + 1)

  const db = create(null, {valueEncoding: 'json'})

  db.put('hello', 0, function () {
    db.put('world', false, function () {
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node && node.value, 0)
      })
      db.get('world', function (err, node) {
        t.error(err, 'no error')
        t.same(node && node.value, false)
      })

      const ite = db.iterator()
      const result = {}

      ite.next(function loop (err, node) {
        t.error(err, 'no error')

        if (!node) {
          t.same(result, {hello: 0, world: false})
          return
        }

        result[node.key] = node.value
        ite.next(loop)
      })
    })
  })
})

tape('can put/get a null value', function (t) {
  t.plan(3)

  const db = create(null, {valueEncoding: 'json'})
  db.put('some key', null, function (err) {
    t.error(err, 'no error')
    db.get('some key', function (err, node) {
      t.error(err, 'no error')
      t.same(node.value, null)
    })
  })
})

tape('can create with metadata', function (t) {
  const db = create(null, {
    valueEncoding: 'json',
    metadata: 'A piece of metadata'
  })
  db.ready(function (err) {
    t.error(err, 'no error')
    db.getMetadata(function (err, metadata) {
      t.error(err, 'no error')
      t.same(metadata, Buffer.from('A piece of metadata'))
      t.end()
    })
  })
})

tape('can support a custom hash function', function (t) {
  const db = create(null, {
    valueEncoding: 'utf-8',
    hash: function (key) {
      return Buffer.from(key)
    }
  })
  db.ready(function (err) {
    t.error(err, 'no error')
    db.put('hello', 'world', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'world')
        t.end()
      })
    })
  })
})

tape('can delete with a custom hash function', function (t) {
  const db = create(null, {
    valueEncoding: 'utf-8',
    hash: function (key) {
      return Buffer.from(key)
    }
  })
  db.ready(function (err) {
    t.error(err, 'no error')
    db.put('hello', 'world', function (err) {
      t.error(err, 'no error')
      db.get('hello', function (err, node) {
        t.error(err, 'no error')
        t.same(node.value, 'world')
        db.del('hello', function (err) {
          t.error(err, 'no error')
          db.get('hello', function (err, node) {
            t.error(err, 'no error')
            t.false(node)
            t.end()
          })
        })
      })
    })
  })
})
