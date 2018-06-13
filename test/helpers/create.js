const ram = require('random-access-memory')
const hypertrie = require('../../')

module.exports = function (key) {
  return hypertrie(ram, key, {valueEncoding: 'json'})
}
