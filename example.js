const hypertrie = require('./')
const hypercore = require('hypercore')
const ram = require('random-access-memory')

const db = hypertrie(
  hypercore(ram)
)

const batch = new Array(20)
for (var i = 0; i < batch.length; i++) {
  batch[i] = {key: '#' + i, value: '#' + i}
}

db.batch(batch, async function () {
  for (var i = 0; i < 20; i++) {
    db.get('#' + i, console.log)
  }
})
