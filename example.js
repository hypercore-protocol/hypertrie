const hypertrie = require('./')
const hypercore = require('hypercore')
const ram = require('random-access-memory')

const db = hypertrie(
  hypercore(ram)
)

const batch = new Array(200)
for (var i = 0; i < batch.length; i++) {
  batch[i] = {key: 'a/#' + i, value: '#' + i}
}

db.batch(batch, async function () {
  db.batch(batch.map(a => true && {key: a.key.replace('a/', 'b/'), value: a.value}), async function () {

    db.createReadStream('', {recursive: false})
      .on('data', data => console.log(data.key))
      .on('end', console.log.bind(console, '(end)'))
  })
})
