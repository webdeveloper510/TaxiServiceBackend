// utils/redis.js
// sudo service redis-server start // to  run the redis on local
const Redis = require("ioredis");

const redisOptions = process.env.REDIS_URL ? process.env.REDIS_URL : {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  ...(process.env.REDIS_PASSWORD && { password: process.env.REDIS_PASSWORD }),
};

console.log('redis testing-----------' , redisOptions)

const redis = new Redis(redisOptions);
const sub = new Redis(redisOptions); // subscriber

// Log when connected
redis.on("connect", () => {
  console.log("✅ Redis connected");
});

// Log when ready to use
redis.on("ready", () => {
  console.log("🚀 Redis is ready");
});

// Handle errors
redis.on("error", (err) => {
  console.error("❌ Redis error:", err.message);
});

// Handle reconnect attempts or disconnection
redis.on("end", () => {
  console.warn("⚠️ Redis connection closed");
});

sub.on("error", (err) => {
  console.error("❌ Redis SUBSCRIBER error:", err.message);
});

sub.on("end", () => {
  console.warn("⚠️ Redis SUBSCRIBER connection closed");
});

module.exports = { redis, sub };
