exports.toCents = (v) => {
  return Math.round((Number(v) || 0) * 100);
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