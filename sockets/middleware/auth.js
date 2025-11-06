const jwt = require("jsonwebtoken")

function attachAuthMiddleware(socket, next) {
  // e.g., client sends ?token=... in connection URL or in headers
  const token = socket.handshake.auth?.token || socket.handshake.query?.token;
  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWTSECRET);
    socket.user = decoded; // attach if needed in handlers
    return next();
  } catch (e) {
    console.log("❌❌❌❌❌❌❌❌❌Error auth failed:",  e.message);
   
    // You can choose to block or allow and handle in events
    return next();
  }
}

module.exports = attachAuthMiddleware ;