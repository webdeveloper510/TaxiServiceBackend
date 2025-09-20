// sockets/company.handlers.js
// Handles company map subscriptions (subscribeBounds, heartbeat, unsubscribe)
const SUB_PREFIX = "company:sub:";       // company:sub:<socketId> => { companyId, bounds }
const SUB_SET_KEY = "company:subs";      // set of socketIds currently subscribed

function registerCompanyHandlers(io, socket, redis) {
  // client: { companyId, bounds }
  socket.on("subscribeBounds", async (payload) => {
    try {
      const { companyId, bounds } = payload;
      if (!companyId || !bounds) return;

      const key = SUB_PREFIX + socket.id;
      const payloadToStore = { companyId, bounds, lastSeenAt: Date.now() };

      await redis.set(key, JSON.stringify(payloadToStore), "EX", 300); // 5 min TTL
      await redis.sadd(SUB_SET_KEY, socket.id);

      // join a per-socket room (useful for simple targeted emits)
      socket.join(`company:${socket.id}`);

      console.log(`Socket ${socket.id} subscribed for company ${companyId}`);
    } catch (err) {
      console.error("subscribeBounds error:", err);
    }
  });

  // client sends simple heartbeat to keep TTL alive
  socket.on("subHeartbeat", async () => {
    try {
      const key = SUB_PREFIX + socket.id;
      const raw = await redis.get(key);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      parsed.lastSeenAt = Date.now();
      await redis.set(key, JSON.stringify(parsed), "EX", 300); // refresh TTL
    } catch (err) {
      console.error("subHeartbeat error:", err);
    }
  });

  socket.on("unsubscribeBounds", async () => {
    try {
      const key = SUB_PREFIX + socket.id;
      await redis.del(key);
      await redis.srem(SUB_SET_KEY, socket.id);
      socket.leave(`company:${socket.id}`);
      console.log("unsubscribed socket", socket.id);
    } catch (err) {
      console.error("unsubscribeBounds error:", err);
    }
  });

  // optional: allow client to request server-side refresh (re-send last known drivers)
  socket.on("refreshViewport", async (payload) => {
    // implement if you want server to push full set of drivers inside bounds on demand
    // we'll skip here for brevity
  });
}

module.exports = { registerCompanyHandlers };
