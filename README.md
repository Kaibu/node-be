[![npm](https://img.shields.io/npm/v/node-be.svg)]()[![JavaScript Style Guide](https://img.shields.io/badge/code_style-standard-brightgreen.svg)](https://standardjs.com)

# About
Battleye lib for Arma 2/3

# Install
```
npm install node-be
```
# Example
```js
let NodeBe = require("node-be")

var battleEyeClient = new NodeBe("IP", 2306, "Password")

//Event: 'message'
//RCon messages and command responses will be emited
client.on('message', function (message) {
  console.log(message)
})

//Event: 'error'
//Errors with connecting/login or socket error will be emitted
client.on('error', function (error) {
  console.log(error)
})

//Event: 'close'
//Will be emitted when the server shuts down, becomes unresponsive or the connection is lost
client.on('close', function () {
  console.log('Connection closed.')
})

//Event: 'listening'
//Will be emitted when the connection is successfully established and login has succeeded
client.on('listening', function () {
  console.log('Connected!')
  
  //send rcon/server commands
  client.sendCommand("players")
  client.sendCommand("say -1 Hello World")
})

//Attempt to connect with given host:port and password
client.connect()
```

# Dependencies
buffer-crc32

# License
MIT