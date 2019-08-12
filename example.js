const hypertrie = require('./')
const Node = require('./lib/node')
const ram = require('random-access-memory')

const db = hypertrie(ram)

const batch = new Array(200)

function put (k, v, cb) {
  db.put(k, JSON.stringify({ data: v }), { intercept: intercept2, link }, cb)
}

function intercept2 (state, cb) {
  const val = JSON.parse(state.head.final().value)
  if (debug) console.log('state', state, val)

  if (val.type === 'rename') {
    return cb(null, {
      target: new Node({ key: state.target.key.replace(val.to, val.from) }),
      head: state.head,
      i: 0
    })
  }

  cb(null, null)
}

function rename (from, to, cb) {
  db.put(to, JSON.stringify({ type: 'rename', from, to }), { intercept: intercept2, link }, function () {
    db.put(from, JSON.stringify({type: 'rename', me: true, from: '/fsdfsdfsfds', to: from }), { intercept: intercept2, link }, function () {
      cb()
    })
  })
}


for (let i = 0; i < 200; i++) {
  put('a/#' + i, 'a/#' + i)
}

let debug = false

put('foo', 'foo', function () {
  rename('a', 'r', function () {
   put('bbb', 'bbb', function () {
    put('a/foo', 'fooo', function () {
      put('r/foo', 'foo', function () {
        put('foo/bar', 'foo', function () {
          db.get('r/#100', {intercept}, function (err, node) {
            console.log(err, node)
            db.get('a/#100', {intercept}, function (err, node) {
              console.log('renamed delted old data?', node)
            })
          })
        })
      })
    })
  })
  })
})

function link (node, cb) {
  return cb(null, node)
}

function intercept (state, cb) {
  const val = JSON.parse(state.head.final().value)
if (debug) console.log(state, '<--')
  if (val.type === 'rename') {
    return cb(null, {
      target: new Node({ key: state.target.key.replace(val.to, val.from) }),
      head: state.head,
      i: 0
    })
  }

  cb(null)
}

/*
db.batch(batch, function () {
  db.createReadStream()
    .on('data', data => console.log(data.key))
    .on('end', _ => console.log('(end)'))
})
*/
