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

util.inherits(NodeBe, require('events').EventEmitter)

NodeBe.prototype.connect = function () {
  let self = this
  this.socket.parent = this
  this.socket.bind(this.port)
  this.socket.on('error', function (err) {
    console.log('Socket error: ' + err)
  })
  this.socket.on('message', function (message, requestInfo) {
    this.parent.lastResponse = new Date().getTime()
    let buffer = Buffer.from(message)

    if (buffer[7] === 0x00) {
      if (buffer[8] === 0x01) {
        this.parent.loggedIn = true
        self.emit('listening')
      } else if (buffer[8] === 0x00) {
        self.emit('error', 'Login failed')
        this.parent.close()
        this.parent.loggedIn = false
        this.parent.error = true
        self.close()
      } else {
        self.emit('error', 'Unknown error')
        this.parent.error = true
        self.close()
      }
      return
    }

    // command response
    if (buffer[7] === 0x02) {
      this.parent.acknowledge(buffer[8])
      this.parent.sequenceNumber = buffer[8]
      self.emit('message', this.parent.stripHeaderServerMessage(buffer).toString())
    }

    // multipacket
    if (buffer[7] === 0x01 && buffer[8] === 0 && buffer[9] === 0) {
      if (buffer[11] === 0) {
        this.parent.multipacket = new Array(buffer[10])
      }

      if (this.parent.multipacket && this.parent.multipacket.length === buffer[10]) {
        this.parent.multipacket[buffer[11]] = this.parent.stripHeaderMultipacket(buffer)
      }

      if (buffer[11] + 1 === buffer[10]) {
        let total = ''
        for (let msg in this.parent.multipacket) {
          total += this.parent.multipacket[msg].toString()
        }
        self.emit('message', total)

        this.parent.multipacket = undefined
      }
    } else if (buffer[7] === 0x01) {
      self.emit('message', this.parent.stripHeaderServerMessage(message).toString())
    }
  })
  this.login()
  this.interval = setInterval(function (client) {
    client.keepAlive()
  }, 10000, this)
}

NodeBe.prototype.sendCommand = function (command) {
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

NodeBe.prototype.send = function (data) {
  if (this.error) { return 1 }
  this.lastCommand = new Date().getTime()
  this.socket.send(data, 0, data.length, this.port, this.ip)
}

NodeBe.prototype.acknowledge = function (sequenceNumber) {
  let buffer = Buffer.alloc(2)
  buffer[0] = 0x02
  buffer[1] = sequenceNumber
  let packet = this.buildPacket(buffer)
  this.send(packet)
}

NodeBe.prototype.keepAlive = function () {
  if (!this.loggedIn) { return }
  let buffer = Buffer.alloc(2)
  buffer[0] = 0x01
  buffer[1] = 0
  buffer[2] = 0
  this.send(this.buildPacket(buffer))
}

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

NodeBe.prototype.buildLoginPacket = function () {
  let buffer = Buffer.alloc(this.password.length + 1)
  buffer[0] = 0x00
  for (let i = 0; i < this.password.length; i++) {
    buffer[1 + i] = this.password.charCodeAt(i)
  }
  return this.buildPacket(buffer)
}

NodeBe.prototype.login = function () {
  let packet = this.buildLoginPacket()
  setTimeout(this.timeout, 3000, this)
  this.send(packet)
}

NodeBe.prototype.timeout = function (client) {
  if ((new Date().getTime() - client.lastResponse) >= 3000) {
    client.close()
  }
}

NodeBe.prototype.stripHeader = function (message) {
  let buffer = Buffer.alloc(message.length - 7)
  for (let i = 0; i < buffer.length; i++) {
    buffer[i] = message[i + 7]
  }
  return buffer
}

NodeBe.prototype.stripHeaderServerMessage = function (message) {
  let buffer = Buffer.alloc(message.length - 9)
  buffer.forEach(function (cur, i) {
    buffer[i] = message[i + 9]
  })
  return buffer
}

NodeBe.prototype.stripHeaderMultipacket = function (message) {
  let buffer = Buffer.alloc(message.length - 12)
  buffer.forEach(function (cur, i) {
    buffer[i] = message[i + 12]
  })
  return buffer
}

NodeBe.prototype.close = function () {
  clearInterval(this.interval)
  this.socket.unref()
  this.socket.close()
  this.emit('close')
}
