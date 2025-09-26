// const { Server } = require("socket.io");
// const  registerDriverHandlers  = require("./handlers/driver.handlers");
// const registerUserHandlers = require("./handlers/user.handlers");
// const registerTripHandlers = require("./handlers/trip.handlers");
// const { attachAuthMiddleware } = require("./middleware/auth"); // optional
// const { redis , sub }= require("../utils/redis");

// async function initSocket(httpServer) {

//   const io = new Server(httpServer, {
//     cors: { origin: "*" },
//   });

//   // Optional: global connection-level middleware (JWT, etc.)
//   // io.use(attachAuthMiddleware); // uncomment if you want auth


//   io.on("connection", (socket) => {
    
//     // Register all your logical groups of events
//     registerDriverHandlers(io, socket);
//     registerUserHandlers(io, socket);
//     registerTripHandlers(io, socket);

//     // Generic disconnect logging is okay here; detailed logic can live in utils
//     socket.on("disconnect", (reason) => {
//       // Handled inside driver handler (it knows driver context)
//       // You can emit a generic log here if you want
//     });
//   });

//   return io;
// }

// module.exports = { initSocket };



const { Server } = require("socket.io");
const registerDriverHandlers = require("./handlers/driver.handlers");
const registerUserHandlers = require("./handlers/user.handlers");
const registerTripHandlers = require("./handlers/trip.handlers");

let io;

function initSocket(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  io.on("connection", (socket) => {
    registerDriverHandlers(io, socket);
    registerUserHandlers(io, socket);
    registerTripHandlers(io, socket);

    socket.on("disconnect", (reason) => {
      // optional logging
    });
  });

  return io; // return real server synchronously
}

function getIO() {
  if (!io) throw new Error("Socket.IO not initialized");
  return io;
}

module.exports = { initSocket, getIO };
