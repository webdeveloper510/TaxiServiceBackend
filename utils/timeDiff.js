const { DateTime, IANAZone } = require("luxon");
/**
 * Convert any valid input into a safe Date object.
 * @param {Date|string|number} value
 * @returns {Date}
 * @throws {TypeError}
 */
function toDate(value) {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) {
    throw new TypeError(`Invalid date value: ${value}`);
  }
  return d;
}

/**
 * Get the exact difference between two date/times in minutes.
 *
 * Returns decimal minutes (e.g., 35.75)
 *
 * @param {Date|string|number} from - earlier datetime
 * @param {Date|string|number} to   - later datetime
 * @returns {number} exact minutes
 *
 * @example
 * exactMinutes("2025-01-10T10:00:00", "2025-01-10T10:45:30")
 * // → 45.5 minutes
 */

function normalizeTimezone(tz) {
  if (!tz) return "UTC";

  // Dynamic only: trim and clean, no static mappings
  return String(tz).trim().replace(/\s+/g, "");
}

function formatUtcToLocalTime(utcValue, targetTimezone, format = "yyyy-LL-dd HH:mm") {
  if (!utcValue) return "";

  const timezone = normalizeTimezone(targetTimezone);
  const safeTz = IANAZone.isValidZone(timezone) ? timezone : "UTC";

  const dt =
    utcValue instanceof Date
      ? DateTime.fromJSDate(utcValue, { zone: "utc" })
      : DateTime.fromISO(
          String(utcValue).trim().replace(/([+-]00:00)$/, "Z"),
          { setZone: true }
        );

  if (!dt.isValid) return "";

  return dt.setZone(safeTz).toFormat(format);
}

/**
 * Convert local datetime + timezone into UTC JS Date
 *
 * @param {string} localDateTime - "2025-12-30T12:00"
 * @param {string} timezone - "Asia/Kolkata"
 * @returns {Date} UTC Date (for MongoDB)
 */

function convertLocalToUTC(localDateTime, timezone) {
  if (!localDateTime || !timezone) {
    throw new Error("localDateTime and timezone are required");
  }

  if (!IANAZone.isValidZone(timezone)) {
    throw new Error(`Invalid timezone: ${timezone}`);
  }

  const dtLocal = DateTime.fromISO(localDateTime, {
    zone: timezone,
    setZone: true,
  });

  if (!dtLocal.isValid) {
    throw new Error(`Invalid datetime: ${dtLocal.invalidReason}`);
  }

  return dtLocal.toUTC().toJSDate();
}

function exactMinutes(from, to) {
  const start = toDate(from);
  const end = toDate(to);

  const diffMs = end.getTime() - start.getTime();
  return diffMs / 60000;  // 60,000 ms per minute → exact minutes
}

const milesToKm = (miles) => {
    return miles ? (Number(miles) * 1.609344).toFixed(2) : "";
  };

module.exports = {
  exactMinutes,
  convertLocalToUTC,
  formatUtcToLocalTime,
  milesToKm
};
