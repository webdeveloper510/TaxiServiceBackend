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
        PENDING: 'Pending', // When trip is created
        NO_SHOW: 'NoShow'// when user will not be present at the trip start location
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
    },
    PAY_OPTION: {
        CASH: 'Cash',
        HOTEL_ACCOUNT: 'Hotel Account',
        CARD: 'Card',
        ON_ACCOUNT: 'ON ACCOUNT'
    },
    ADMIN_SETTINGS: {
        COMMISION: 'commision',
        PRE_NOTIFICATION_TIME: 'pre_notification_time', // The system will send a notification to the user a specified amount of time before the scheduled trip begins
    },
    SUBSCRIPTION_PAYMENT_STATUS: {
        PAID: true,
        UNPAID: false
    },
    SUBSCRIPTION_STATUS: {
        ACTIVE: true,
        INACTIVE: false
    },
    SUBSCRIPTION_CANCEL_REASON: {
        USER_CANCEL: `user_cancel`,
        CARD_DECLINED: `card_declined`,
        INSUFFUCIENT_FUNDS: `insufficient_funds`,
        EXPIRED_CARD: `expired_card`,
        CARD_BLOCKED: `card_blocked`,
        PROCESSING_ERROR: `processing_error`,
        UNKNOWN_ERROR: ` unknown_error`
    },
    CONNECTED_ACCOUNT: {
        ACCOUNT_ATTACHED_STATUS: {
            ACCOUNT_ATTACHED: true,
            ACCOUNT_NOT_ATTACHED: false,
        }
        
    }
}