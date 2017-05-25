const NodeBe = require('..')

let client = new NodeBe('127.0.0.1', 2306, 'password')

client.on('message', function (message) {
  console.log(message)
})

client.on('error', function (error) {
  console.log(error)
})

client.on('close', function () {
  console.log('Connection closed.')
})

client.on('listening', function () {
  console.log('Connected!')

  client.sendCommand('players')
  client.sendCommand('say -1 Hello World')
})

client.connect()
