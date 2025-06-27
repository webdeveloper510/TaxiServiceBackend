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
    NETHERLANDS_COUNTRY_CODE: `+31`,
    ADMIN_SETTINGS_SEED: [
        { 
            key: 'commision', 
            value: '10' 
        },
        { 
            key: 'pre_notification_time', 
            value: '20'
        },
    ],
    ROLES: {
        COMPANY: 'COMPANY',
        SUPER_ADMIN: 'SUPER_ADMIN',
        HOTEL: 'HOTEL',
        DRIVER: 'DRIVER',
        ADMIN: 'ADMIN'
    },
    OTP_CODE:205 ,
    TRIP_STATUS: {
        APPROVED: 'Accepted', // When trip goes to the driver for 20 seconds for accepting the ride
        BOOKED: 'Booked', // When Driver has been accepted the trip
        REACHED: 'Reached', // When Driver went to the point from from where driver will pick the customer
        ACTIVE: 'Active', // When driver is going on customer destination
        COMPLETED: 'Completed', // When driver reached to the destination
        CANCELED: 'Canceled', //  When compnay cancelled the trip from driver
        PENDING: 'Pending', // When trip is created
        NO_SHOW: 'NoShow',// when user will not be present at the trip start location
        CUSTOMER_CENCEL: 'CustomerCancel', // When customer cancelled the trip
    },
    TRIP_CANCELLATION_REQUEST_STATUS: {
        PENDING: 'Pending',
        APPROVED: 'Accepted',
        REJECTED: 'Rejected',
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
        // HOTEL_ACCOUNT: 'Hotel Account',
        DEBIT_CARD: 'Debit Card',
        CREDIT_CARD: 'Credit Card',
        ON_ACCOUNT: 'On Account'
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
        DRIVER_BLOACKED_BY_ADMIN: `driver_blocked_by_admin`,
        PROCESSING_ERROR: `processing_error`,
        UNKNOWN_ERROR: ` unknown_error`
    },
    CONNECTED_ACCOUNT: {
        ACCOUNT_ATTACHED_STATUS: {
            ACCOUNT_ATTACHED: true,
            ACCOUNT_NOT_ATTACHED: false,
        }
        
    },
    PAYMENT_COLLECTION_TYPE: {
        MANUALLY: `MANUALLY`,
        ONLINE: `ONLINE`,
        PENDING: `PENDING`,
        NOT_REQUIRED: 'NOT_REQUIRED' // or 'ZERO_DUE' or 'EXEMPTED' when driver will not pay any commision
    },
    PAYOUT_TANSFER_STATUS: {
        PENDING: `PENDING`,
        IN_TRANSIT: `IN_TRANSIT`,
        PAID: `PAID`,
        FAILED: `FAILED`,
        NOT_INITIATED: `NOT_INITIATED`,
    },
    SUBSCRIPTION_PLAN_NAMES: {
        PRO: "Pro",
        PREMIUM: "Premium",
        BASIC: "Basic",
        TEST: "test daily",
        SPECIAL: "Special" // no need to take susbcription. admin will allow this plan only for any user
    },
    SMS_EVENTS: {
        TRIP_CREATE: "TRIP_CREATE",
        DRIVER_ON_THE_WAY: "DRIVER_ON_THE_WAY",
        CHANGE_PICKUP_DATE_TIME: "CHANGE_PICKUP_DATE_TIME",
    },
    SMS_STATUS: {
        SENT: "SENT",
        FAILED: "FAILED",
    },
    SMS_RECHARGE_STATUS: {
        PENDING: "PENDING",
        PAID: "PAID",
        FAILED: "FAILED",
    },
    CHARGE_FEE_PER_SMS: 15, // in cents
    NAVIGATION_MODE: {
        GOOGLE_MAP:`google_maps`,
        DIRECT: `direct`,
        DEFAULT: ``
    },
    BOOKING_SOURCE: {
        COMPANY_BOOKING_LINK: 'COMPANY_BOOKING_LINK',
        HOTEL_BOOKING_LINK: 'HOTEL_BOOKING_LINK',
        COMPANY_DASHBOARD: 'COMPANY_DASHBOARD',
        HOTEL_DASHBOARD: 'HOTEL_DASHBOARD',
        PARTNER_ACCOUNT_DASHBOARD: 'PARTNER_ACCOUNT_DASHBOARD',
        COMPANY_ACCESS_DASHBOARD: 'COMPANY_ACCESS_DASHBOARD',
        COMPANY_APP: 'COMPANY_APP',
        PARTNER_ACCOUNT_APP: 'PARTNER_ACCOUNT_APP',
        COMPANY_ACCESS_APP: 'COMPANY_ACCESS_APP',
    },
    TRIP_COMMISSION_TYPE :{
        FIXED: `Fixed`,
        PERCENTAGE: `Percentage`,
        DEFAULT:   ``
    },

    NOTIFICATION_TYPE:{
        ALLOCATE_TRIP: `allocate_trip`,
        RETRIEVE_TRIP: `retrieve_trip`,
        CANCEL_TRIP: `cancel_trip`,
        UPDATE_TRIP: `cancel_trip`,
        OTHER: `other`,
    },
    UPLOADED_PRICE_TYPE: {
        ZIP_CODE: 'ZIP_CODE',
        ADDRESS: 'ADDRESS',
    },
    ZIP_CODE_UPLOAD_TYPE_REQUIRED_FIELDS: {
        DEPARTURE_PLACE: "Departure Zipcode",
        ARRIVAL_PLACE:"Arrival Zipcode",
        NUMBER_OF_PERSONS:"Number of persons",
        AMOUNT:"Amount",
        VEHICLE_TYPE:"Vehicle type"
    },
    ZIP_CODE_UPLOAD_TYPE_REQUIRED_COLUMNS: {
        DEPARTURE_PLACE: "Departure Zipcode",
        ARRIVAL_PLACE:"Arrival Zipcode",
        NUMBER_OF_PERSONS:"Number of persons",
        AMOUNT:"Amount",
        VEHICLE_TYPE:"Vehicle type"
    },
    ADDRESS_UPLOAD_TYPE_REQUIRED_FIELDS: {
        DEPARTURE_PLACE: "Departure place",
        ARRIVAL_PLACE:"Arrival place",
        NUMBER_OF_PERSONS:"Number of persons",
        AMOUNT:"Amount",
        VEHICLE_TYPE:"Vehicle type"
    },
    ADDRESS_UPLOAD_TYPE_REQUIRED_COLUMNS: {
        DEPARTURE_PLACE: "Departure place",
        ARRIVAL_PLACE:"Arrival place",
        NUMBER_OF_PERSONS:"Number of persons",
        AMOUNT:"Amount",
        VEHICLE_TYPE:"Vehicle type"
    }
}