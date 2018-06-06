const hypertrie = require('./')
const hypercore = require('hypercore')
const ram = require('random-access-memory')

const db = hypertrie(
  hypercore(ram)
)

const batch = new Array(200)
for (var i = 0; i < batch.length; i++) {
  batch[i] = {key: '#' + i, value: '#' + i}
}

db.batch(batch, async function () {
  db.batch(batch, async function () {
    db.createReadStream()
      .on('data', data => console.log(data.key))
      .on('end', console.log.bind(console, '(end)'))
  })
})
