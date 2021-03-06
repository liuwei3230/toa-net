'use strict'

const net = require('net')
const thunk = require('thunks')()
const EventEmitter = require('events').EventEmitter

const Socket = require('./socket')

class Server extends EventEmitter {
  constructor (connectionListener) {
    super()

    this.connections = Object.create(null)
    this.server = net.createServer((_socket) => {
      let socket = new Socket()
      let authenticator = this.getAuthenticator()
      socket.init(_socket, authenticator)
      socket.connected = true
      this.connections[socket.sid] = socket
      socket.on('close', () => delete this.connections[socket.sid])

      if (!authenticator) connectionListener.call(this, socket)
      else {
        // invalid socket may throw error before 'auth', just destroy it.
        // i.e. probe socket from Server Load Balancer
        let initErrorListener = (err) => {
          socket.destroy()
          err.socket = socket
          // emit 'warn' to server, not 'error', because it is not server error.
          this.emit('warn', err)
        }

        socket.once('error', initErrorListener)
          .once('auth', () => {
            socket.removeListener('error', initErrorListener)
            connectionListener.call(this, socket)
          })
      }
    })
      .on('error', (error) => this.emit('error', error))
      .on('listening', () => this.emit('listening'))
      .on('close', () => this.emit('close'))
  }

  address () {
    return this.server.address()
  }

  getConnections () {
    return thunk((callback) => this.server.getConnections(callback))
  }

  // Abstract method. Should be overridden to enable authentication.
  getAuthenticator () {
    return null // Disable authentication
  }

  close () {
    Object.keys(this.connections).forEach((sid) => {
      let socket = this.connections[sid]
      if (socket) socket.destroy()
      delete this.connections[sid]
    })
    this.server.close.apply(this.server, arguments)
  }

  listen () {
    return this.server.listen.apply(this.server, arguments)
  }
}

module.exports = Server
