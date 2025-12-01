exports.formatPhoneNumber = (countryCode, phone) => {
  const result = {
    standardFormat: null,
    callingFormat: null
  };

  if (
    !countryCode ||
    !phone ||
    (typeof countryCode !== "string" && typeof countryCode !== "number") ||
    (typeof phone !== "string" && typeof phone !== "number")
  ) {
    return result;
  }

  countryCode = String(countryCode).trim();
  phone = String(phone).trim();

  if (!countryCode.startsWith("+")) {
    countryCode = "+" + countryCode;
  }

  phone = phone.replace(/\s+/g, "").replace(/^0+/, "");

  result.standardFormat = `${countryCode} ${phone}`;
  result.callingFormat = `${countryCode}${phone}`;

  return result;
};
