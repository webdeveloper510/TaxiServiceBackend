const { Server } = require("socket.io");
const  registerDriverHandlers  = require("./handlers/driver.handlers");
const registerUserHandlers = require("./handlers/user.handlers");
const registerTripHandlers = require("./handlers/trip.handlers");
const { attachAuthMiddleware } = require("./middleware/auth"); // optional
const redis = require("../utils/redis");
console.log("driver.handlers export:", typeof registerDriverHandlers);
async function initSocket(httpServer) {

  const io = new Server(httpServer, {
    cors: { origin: "*" },
  });

  // Optional: global connection-level middleware (JWT, etc.)
  // io.use(attachAuthMiddleware); // uncomment if you want auth

  // create a dedicated subscriber to listen for published driver updates
  const subscriber = redis.duplicate();
  await subscriber.connect().catch((err)=>{}); // ioredis duplicate is connected lazily in some versions
  await subscriber.subscribe("driverUpdates");

  subscriber.on("message", async (channel, message) => {
    if (channel !== "driverUpdates") return;
    try {
      const driver = JSON.parse(message);
      // for each server instance, call the notifier which will fetch active company socket ids
      await notifyCompaniesForDriver(io, driver);
    } catch (err) {
      console.error("Error handling driverUpdates message:", err);
    }
  });

  io.on("connection", (socket) => {
    // Register all your logical groups of events
    registerDriverHandlers(io, socket);
    registerUserHandlers(io, socket);
    registerTripHandlers(io, socket);

    // Generic disconnect logging is okay here; detailed logic can live in utils
    socket.on("disconnect", (reason) => {
      // Handled inside driver handler (it knows driver context)
      // You can emit a generic log here if you want
    });
  });

  return io;
}

module.exports = { initSocket };