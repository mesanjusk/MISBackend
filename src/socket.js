const { Server } = require("socket.io");

const ioInstances = [];

const buildCorsOptions = () => {
  const allowedOrigins = process.env.SOCKET_IO_CORS_ORIGIN;

  if (!allowedOrigins) {
    return { origin: "*" };
  }

  return {
    origin: allowedOrigins.split(",").map((origin) => origin.trim()),
  };
};

const initSocket = (server, serverLabel = "default") => {
  const ioInstance = new Server(server, {
    cors: buildCorsOptions(),
  });

  ioInstances.push(ioInstance);

  ioInstance.on("connection", (socket) => {
    console.log(`[socket.io:${serverLabel}] Client connected: ${socket.id}`);

    socket.on("disconnect", (reason) => {
      console.log(
        `[socket.io:${serverLabel}] Client disconnected: ${socket.id} (${reason})`
      );
    });
  });

  return ioInstance;
};

const emitNewMessage = (message) => {
  if (!ioInstances.length) {
    console.warn(
      "[socket.io] Cannot emit new_message because Socket.IO is not initialized yet"
    );
    return;
  }

  console.log("[socket.io] Emitting new_message event");
  ioInstances.forEach((ioInstance) => {
    ioInstance.emit("new_message", message);
  });
};

module.exports = {
  initSocket,
  emitNewMessage,
};
