const postcodes = require("../zipcodes/zipcodes.nl.json");
const countryCodes = require("../countryCodes/countryCode.js");

function getCityByPostcode(postcode) {

    if (!postcode) return null;
    // clean "1034 MN" → "1034"
    const digits = postcode.replace(/\s+/g, "").slice(0, 4);

    const entry = postcodes.find(p => p.zipcode === digits);
    
    if (entry) {

      
      return {
        city: entry?.place || "",
        country:  countryCodes[entry?.country_code.toUpperCase()] || "The Netherlands"
      }
    }
    return {city : "" , country: "The Netherlands"};
}

module.exports = {
  getCityByPostcode,
};