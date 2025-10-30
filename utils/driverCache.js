// driverCache.js
const lastEmitByDriver = new Map(); // driverId -> { lat, lng, ts }
const lastDbUpdate = new Map(); // driverId -> timestamp

module.exports = {
  lastEmitByDriver,
  lastDbUpdate
};