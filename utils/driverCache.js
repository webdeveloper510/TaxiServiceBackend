// driverCache.js
const lastEmitByDriver = new Map(); // driverId -> { lat, lng, ts }
const lastDbUpdate = new Map(); // driverId -> timestamp
// Track pending timers to prevent duplicates
const disconnectTimers = new Map();

module.exports = {
  lastEmitByDriver,
  lastDbUpdate , 
  disconnectTimers
};