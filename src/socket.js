const { Server } = require("socket.io");

let ioInstance = null;

const buildCorsOptions = () => {
  return {
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://your-frontend-domain.com", // 🔁 replace with your real frontend URL
    ],
    methods: ["GET", "POST"],
    credentials: true,
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