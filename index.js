const udp = require('dgram')
const crc32 = require('buffer-crc32')
const util = require('util')

module.exports = NodeBe

function NodeBe (ip, port, password) {
  this.socket = udp.createSocket('udp4')
  this.ip = ip
  this.port = port
  this.password = password
  this.sequenceNumber = 0
  this.loggedIn = false
  this.lastResponse = 0
  this.lastCommand = 0
  this.error = false
  this.interval = undefined
  this.multipacket = undefined
}

// inherit eventemitter
util.inherits(NodeBe, require('events').EventEmitter)

// login
NodeBe.prototype.connect = function () {
  let self = this
  this.socket.parent = this
  this.socket.bind()
  this.socket.on('error', function (err) {
    console.log('Socket error: ' + err)
  })
  this.socket.on('message', function (message, requestInfo) {
    self.lastResponse = new Date().getTime()
    let buffer = Buffer.from(message)

    if (message.length === 9) {
      // ignore keepalive packet
    }

    if (buffer[7] === 0x00) {
      if (buffer[8] === 0x01) {
        // success
        self.loggedIn = true
        self.emit('listening')
      } else if (buffer[8] === 0x00) {
        // login failes - wrong password
        self.emit('error', 'Login failed')
        self.loggedIn = false
        self.error = true
        self.close()
      } else {
        // something weird happened
        self.emit('error', 'Unknown error')
        self.error = true
        self.close()
      }
      return
    }

    // command response
    if (buffer[7] === 0x02) {
      self.acknowledge(buffer[8])
      self.sequenceNumber = buffer[8]
      self.emit('message', self.stripHeaderServerMessage(buffer).toString())
    }

    // multipacket
    if (buffer[7] === 0x01 && buffer[8] === 0 && buffer[9] === 0) {
      if (buffer[11] === 0) {
        self.multipacket = new Array(buffer[10])
      }

      if (self.multipacket && self.multipacket.length === buffer[10]) {
        self.multipacket[buffer[11]] = self.stripHeaderMultipacket(buffer)
      }

      if (buffer[11] + 1 === buffer[10]) {
        let total = ''
        for (let msg in self.multipacket) {
          total += self.multipacket[msg].toString()
        }
        self.emit('message', total)

        self.multipacket = undefined
      }
    }
  })
  this.login()
  this.interval = setInterval(function (client) {
    client.keepAlive()
  }, 25000, this)
}

// build command packet
NodeBe.prototype.sendCommand = function (command) {
  if (this.loggedIn && !this.error) {
    let buffer = Buffer.alloc(command.length + 2)
    buffer[0] = 0x01
    buffer[1] = 0
    for (let i = 0; i < command.length; i++) {
      buffer[2 + i] = command.charCodeAt(i)
    }
    let packet = this.buildPacket(buffer)
    setTimeout(this.timeout, 3000, this)
    this.send(packet)
  }
}

// send prepared packet
NodeBe.prototype.send = function (data) {
  if (this.error) { return 1 }
  this.lastCommand = new Date().getTime()
  this.socket.send(data, 0, data.length, this.port, this.ip)
}

// build ack package
NodeBe.prototype.acknowledge = function (sequenceNumber) {
  let buffer = Buffer.alloc(2)
  buffer[0] = 0x02
  buffer[1] = sequenceNumber
  let packet = this.buildPacket(buffer)
  this.send(packet)
}

// build keepAlive packet
NodeBe.prototype.keepAlive = function () {
  if (!this.loggedIn) { return }
  let buffer = Buffer.alloc(2)
  buffer[0] = 0x01
  buffer[1] = 0
  buffer[2] = 0
  let packet = this.buildPacket(buffer)
  setTimeout(this.timeout, 3000, this)
  this.send(packet)
}

// add nessesary headers
NodeBe.prototype.buildPacket = function (command) {
  let buffer = Buffer.alloc(7 + command.length)
  buffer[0] = 0x42
  buffer[1] = 0x45
  let nbuffer = Buffer.alloc(1 + command.length)
  nbuffer[0] = 0xFF
  command.forEach(function (cur, i) {
    nbuffer[1 + i] = cur
  })
  let crc = crc32(nbuffer)
  for (let i = 0; i < 4; i++) {
    buffer[5 - i] = crc[i]
  }
  nbuffer.forEach(function (cur, i) {
    buffer[i + 6] = cur
  })
  return buffer
}

// build login packet
NodeBe.prototype.buildLoginPacket = function () {
  let buffer = Buffer.alloc(this.password.length + 1)
  buffer[0] = 0x00
  for (let i = 0; i < this.password.length; i++) {
    buffer[1 + i] = this.password.charCodeAt(i)
  }
  return this.buildPacket(buffer)
}

// send login packet
NodeBe.prototype.login = function () {
  let packet = this.buildLoginPacket()
  setTimeout(this.timeout, 3000, this)
  this.send(packet)
}

// timeout to check for server shutdown/connection loss
NodeBe.prototype.timeout = function (client) {
  if ((new Date().getTime() - client.lastResponse) >= 5000) {
    try {
      client.close()
    } catch (e) {
      console.log(e)
    }
  }
}

// strip BE header
NodeBe.prototype.stripHeader = function (message) {
  let buffer = Buffer.alloc(message.length - 7)
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = message[i + 7]
  }
  return buffer
}

// strip server message header
NodeBe.prototype.stripHeaderServerMessage = function (message) {
  let buffer = Buffer.alloc(message.length - 9)
  buffer.forEach(function (cur, i) {
    buffer[i] = message[i + 9]
  })
  return buffer
}

// strip multipacket header
NodeBe.prototype.stripHeaderMultipacket = function (message) {
  let buffer = Buffer.alloc(message.length - 12)
  buffer.forEach(function (cur, i) {
    buffer[i] = message[i + 12]
  })
  return buffer
}

// close socket and shutdown
NodeBe.prototype.close = function () {
  this.loggedIn = false
  clearInterval(this.interval)
  this.socket.unref()
  this.socket.close()
  this.emit('close')
}
