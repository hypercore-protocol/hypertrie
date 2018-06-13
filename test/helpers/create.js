const ram = require('random-access-memory')
const hypertrie = require('hypertrie')

module.exports = function (key) {
  return hypertrie(ram, key, {valueEncoding: 'json'})
}
