const socketIO = require('socket.io');

let ioInstance = null;

const initSocket = (server) => {
  ioInstance = socketIO(server, {
    cors: { origin: '*' },
  });

  ioInstance.on('connection', (socket) => {
    console.log(`[socket.io] Client connected: ${socket.id}`);

    socket.on('disconnect', (reason) => {
      console.log(`[socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
};

const emitNewMessage = (message) => {
  if (!ioInstance) {
    console.warn('[socket.io] Cannot emit new_message because Socket.IO is not initialized yet');
    return;
  }

  console.log('[socket.io] Emitting new_message event');
  ioInstance.emit('new_message', message);
};

module.exports = {
  initSocket,
  emitNewMessage,
};
