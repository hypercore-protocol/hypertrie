const hypertrie = require('./')
const hypercore = require('hypercore')

const db = hypertrie(
  hypercore('db')
)

db.batch([], function () {
  console.log('hi', db.feed.length)
  db.get('#2', console.log)
})
