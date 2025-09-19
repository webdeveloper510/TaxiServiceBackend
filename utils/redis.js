// utils/redis.js
// sudo service redis-server start // to  run the redis on local
const Redis = require("ioredis");

const redisOptions = process.env.REDIS_URL ? process.env.REDIS_URL : {
  host: process.env.REDIS_HOST || "127.0.0.1",
  port: process.env.REDIS_PORT ? parseInt(process.env.REDIS_PORT) : 6379,
  // password: process.env.REDIS_PASSWORD || undefined,
};

const redis = new Redis(redisOptions);
const sub = new Redis(redisOptions); // subscriber

module.exports = { redis, sub };
