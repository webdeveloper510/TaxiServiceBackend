module.exports={
    success_code : 200,
    error_code:401,
    not_found:404,
    tokenError: 409,
    REVOKED_ACCOUNT_ERROR: 410,
    server_body_error : 500,
    ACCOUNT_SHARE_REVOKED: "REVOKED",
    ACCOUNT_SHARE_INVOKED: "INVOKED",
    ACCESS_ERROR_CODE: 202,
    ROLES: {
        COMPANY: 'COMPANY',
        SUPER_ADMIN: 'SUPER_ADMIN',
        HOTEL: 'HOTEL',
        DRIVER: 'DRIVER',
        ADMIN: 'ADMIN'
    },
    OTP_CODE:205 ,
    TRIP_STATUS: {
        APPROVED: 'Approved', // When trip goes to the driver for 20 seconds for accepting the ride
        BOOKED: 'Booked', // When Driver has been accepted the trip
        REACHED: 'Reached', // When Driver went to the point from from where driver will pick the customer
        ACTIVE: 'Active', // When driver is going on customer destination
        COMPLETED: 'Completed', // When driver reached to the destination
        CANCELED: 'Canceled', //  When compnay cancelled the trip from driver
        PENDING: 'Pending' // When trip is created
    },
    DRIVER_STATUS: {
        VERIFIED: 'Verified',
        UNVERIFIED: 'Unverified', 
        REGISTERED : 'Registered',
        DELETED : 'Deleted',
    },

    DRIVER_OFFLINE_ONLINE_STATUS: {
        ALL: 'All',
        OFFLINE: 'Offline', 
        ONLINE : 'Online',
        INRIDE : 'InRide',
    }
}