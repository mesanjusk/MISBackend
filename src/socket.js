const { Server } = require("socket.io");

let ioInstance = null;

const buildCorsOptions = () => {
  const allowedOrigins = process.env.SOCKET_IO_CORS_ORIGIN;

  if (!allowedOrigins) {
    return { origin: "*" };
  }

  return {
    origin: allowedOrigins.split(",").map((origin) => origin.trim()),
  };
};

const initSocket = (server) => {
  ioInstance = new Server(server, {
    cors: buildCorsOptions(),
  });

  ioInstance.on("connection", (socket) => {
    console.log(`[socket.io] Client connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(`[socket.io] Client disconnected: ${socket.id} (${reason})`);
    });
  });

  return ioInstance;
};

const emitNewMessage = (message) => {
  if (!ioInstance) {
    console.warn(
      "[socket.io] Cannot emit new_message because Socket.IO is not initialized yet"
    );
    return;
  }

  console.log("[socket.io] Emitting new_message event");
  ioInstance.emit("new_message", message);
};

module.exports = {
  initSocket,
  emitNewMessage,
};
