const hypertrie = require('./')
const ram = require('random-access-memory')

const db = hypertrie(ram)

const batch = new Array(200)
for (var i = 0; i < batch.length; i++) {
  batch[i] = {key: 'a/#' + i, value: '#' + i}
}

db.batch(batch, function () {
  db.createReadStream()
    .on('data', data => console.log(data.key))
    .on('end', _ => console.log('(end)'))
})
