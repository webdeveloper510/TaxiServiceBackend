
const {formatUtcToLocalTime} = require("../../timeDiff")

exports.getHotelTripsExportSchema = () => {
  const columns = [
    { header: "Trip ID", key: "trip_id", width: 22 },
    { header: "Status", key: "trip_status", width: 14 },
    { header: "Pickup Address", key: "pickup_address", width: 40 },
    { header: "Drop Address", key: "drop_address", width: 40 },
    { header: "Pickup DateTime", key: "pickup_date_time", width: 22, numFmt: "dd-mm-yyyy hh:mm" },
    { header: "Timezone", key: "pickup_timezone", width: 16 },
    // { header: "Driver", key: "driver_name", width: 22 },
    // { header: "Vehicle", key: "vehicle", width: 22 },
    { header: "Pay Option", key: "pay_option", width: 16 },
    // { header: "Commission Type", key: "commission_type", width: 18 },
    // { header: "Commission Value", key: "commission_value", width: 18 },
    { header: "Distance (Km)", key: "trip_distance", width: 14 },
    { header: "Room No", key: "roomNumber", width: 12 },
    // { header: "Created At", key: "createdAt", width: 22, numFmt: "dd-mm-yyyy hh:mm" },
    { header: "Comment", key: "comment", width: 30 },
  ];

  const milesToKm = (miles) => {
    return miles ? (Number(miles) * 1.609344).toFixed(2) : "";
  };
  const rowMapper = (doc) => {

    // const c = commissionToText(doc.commission);
    const pickup_address = doc?.trip_from?.address || "";
    const drop_address = doc?.trip_to?.address || "";
    const pickup_date_time = formatUtcToLocalTime(doc.pickup_date_time , doc.pickup_timezone , "dd-LL-yyyy HH:mm");
    const trip_distance = milesToKm(doc.trip_distance);
   


    return {
      trip_id: doc.trip_id || "",
      trip_status: doc.trip_status || "",
      pickup_address: pickup_address || "",
      drop_address: drop_address || "",
      pickup_date_time: pickup_date_time,
      pickup_timezone: doc.pickup_timezone || "",
      // driver_name: doc.driver_name || "",
      // vehicle: doc.vehicle || "",
      pay_option: doc.pay_option || "",
    //   commission_type: c.type,
    //   commission_value: c.value,
      trip_distance: trip_distance ?? "",
      roomNumber: doc.roomNumber ?? "",
      // createdAt: doc.createdAt ? new Date(doc.createdAt) : "",
      comment: doc.comment || "",
    };
  };

  return { columns, rowMapper };
};
