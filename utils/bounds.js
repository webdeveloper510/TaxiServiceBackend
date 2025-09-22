exports.isInsideBounds = (driver, bounds) => {
  return (
    driver.lat >= bounds.latMin &&
    driver.lat <= bounds.latMax &&
    driver.lng >= bounds.lngMin &&
    driver.lng <= bounds.lngMax
  );
}

