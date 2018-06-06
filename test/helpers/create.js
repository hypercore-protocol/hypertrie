const ram = require('random-access-memory')
const hypercore = require('hypercore')
const hypertrie = require('hypertrie')

module.exports = function () {
  return hypertrie(hypercore(ram), {valueEncoding: 'json'})
}
