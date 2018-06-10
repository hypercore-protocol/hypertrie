const ram = require('random-access-memory')
const hypercore = require('hypercore')
const hypertrie = require('hypertrie')

module.exports = function (key) {
  return hypertrie(hypercore(ram, key), {valueEncoding: 'json'})
}
