exports.toCents = (value) => {

  if (value === null || value === undefined) {
    console.log("❌❌❌❌❌❌❌❌❌Error toCents: value is required");
    throw new Error("toCents: value is required");
  }

  const num = Number(value);

  if (!Number.isFinite(num) || num < 0 ) {
    console.log("❌❌❌❌❌❌❌❌❌Error toCents: invalid number:");
    throw new Error(`toCents: invalid number (${value})`);
  }

  if (Math.round(num * 100) !== num * 100) {
    console.log("❌❌❌❌❌❌❌❌❌Error toCents: more than 2 decimal places:");
    throw new Error(`toCents: more than 2 decimal places (${value})`);
  }

  // Truncate to 2 decimal places (NO rounding)
  const truncated = Math.trunc(num * 100) / 100;

  // Convert to cents safely
  return Math.trunc(truncated * 100);
};

exports.getAvailableCentsFor = (balanceObj, currency = 'eur') => {
  const row = (balanceObj.available || []).find(
    (b) => (b.currency || '').toLowerCase() === currency.toLowerCase()
  );
  return row ? Number(row.amount || 0) : 0;
};

exports.sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

exports.toConstantCase = (value = "") => {
  if (typeof value !== "string") return "";
  return value.toUpperCase();
}