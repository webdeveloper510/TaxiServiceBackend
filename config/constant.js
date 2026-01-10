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
    BRAND_NAME: "IDISPATCH MOBILITY",
    JWT_TOKEN_EXPIRE:"30d",
    NETHERLANDS_COUNTRY_CODE: 31, // this is netherland code
    MIN_TIME_MS: 15_000 ,         // ✅ minimum time between broadcasts
    DB_SAVE_MS : 15_000,         // ✅ minimum time between DB saves
    JITTER_METERS: 5,            // ignore tiny GPS jitte
    MIN_EMIT_INTERVAL_MS : 4_000,  // ✅ minimum time between frontend emits
    DRIVER_AUTO_LOGOUT: 120_000 , // 120_000 = 2 * 60 * 1000 = 120 seconds
    CUSTOMER_CANCEL_TIMING_TRIP: 120, //  2 minutes will be applied if no value find in company settings 
    CUSTOMER_PRE_TRIP_NOTIFICATION_TIME: 10, // cutsomer will get notification 10 minutes before the trip start time
    DRIVER_DOCUMENT_EXPIRY_REMINDER_DAYS_LIST: [30, 15, 5], // we will send warning to expiration of document before soem day like 30 days , 15 days and 5 days 
    DRIVER_TRIP_PAYMENT: {
        PAID: true,
        UNPAID: false
    },
    DRIVER_DOC_TYPE : {
            PROFILE_PHOTO: "PROFILE_PHOTO",
            KVK_KIWA: "KVK_KIWA", // Kiwa / Business registration
            CHAUFFEUR_CARD: "CHAUFFEUR_CARD",
            DRIVER_LICENSE: "DRIVER_LICENSE",
    },
    DOC_STATUS : {
        NOT_UPLOADED: "NOT_UPLOADED",
        PENDING: "PENDING",
        APPROVED: "APPROVED",
        REJECTED: "REJECTED",
        EXPIRED: "EXPIRED",
    },
    DRIVER_VERIFICATION_STATUS : {
        NOT_SUBMITTED: "NOT_SUBMITTED",
        UNDER_REVIEW: "UNDER_REVIEW",
        VERIFIED: "VERIFIED",
        REJECTED: "REJECTED",
        EXPIRED: "EXPIRED",
    },
    TRIP_HISTORY_ENUM_STATUS: {
        ASSIGN:"ASSIGN",
        REASSIGN:"REASSIGN",
        RETRIEVE:"RETRIEVE",
        CANCEL:"CANCEL", // finally trip has been cancelled and no more will be used
        CUSTOMER_CANCEL:"CUSTOMER_CANCEL",
        DRIVER_CANCEL_REQUEST:"DRIVER_CANCEL_REQUEST",
        CANCEL_APPROVED:"CANCEL_APPROVED", // regarding the cancel request
        CANCEL_REJECTED:"CANCEL_REJECTED", // regarding the cancel request
    },
    ADMIN_SETTINGS_SEED: [
        { 
            key: 'commission', 
            value: '10' 
        },
        { 
            key: 'pre_notification_time', 
            value: '20'
        },
    ],
    ADMIN_CAR_TYPE_SEED: [
        { 
            name: 'car', 
            passangerLimit: 4
        },
        { 
            name: 'van', 
            passangerLimit: 8
        },
        { 
            name: 'luxury', 
            passangerLimit: 4
        },
        { 
            name: 'wagon', 
            passangerLimit: 4
        },
    ],
    ROLES: {
        COMPANY: 'COMPANY',
        SUPER_ADMIN: 'SUPER_ADMIN',
        HOTEL: 'HOTEL',
        DRIVER: 'DRIVER',
        ADMIN: 'ADMIN',
        CUSTOMER: 'CUSTOMER'
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
        NO_SHOW: 'NoShow',// when user will not be present at the trip start location // CUSTOMER_CENCEL: 'CustomerCancel', // When customer cancelled the trip
        
    },
    TRIP_CANCELLED_BY_ROLE: {
        COMPANY: "COMPANY",
        HOTEL: "HOTEL",
        USER: "USER", // who will ride the trip with driver ... main user
        PARTNER_ACCESS: "PARTNER_ACCESS",
        COMPANY_PARTIAL_ACCESS: "COMPANY_PARTIAL_ACCESS"
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
        BLOCKED: 'Blocked',
        REJECTED: 'Rejected' // when admin will disapprove driver's documents
    },

    DRIVER_OFFLINE_ONLINE_STATUS: { // admin dashboard status
        ALL: 'All',
        OFFLINE: 'Offline', 
        ONLINE : 'Online',
        INRIDE : 'InRide',
    },
    DRIVER_STATE: { // admin dashboard status
        AVAILABLE: 'AVAILABLE', // when he is free // color green
        NOT_AVAILABLE: 'NOT_AVAILABLE',  // when he is not free // color red
        ON_THE_WAY : 'ON_THE_WAY', // when he is going to pickup the customer // color yellow
        ON_TRIP : 'ON_TRIP', // when he pickup the customer and going to his destination // // color red
    },
    PAY_OPTION: {
        CASH: 'Cash',
        // HOTEL_ACCOUNT: 'Hotel Account',
        DEBIT_CARD: 'Debit Card',
        CREDIT_CARD: 'Credit Card',
        ON_ACCOUNT: 'On Account'
    },
    ADMIN_SETTINGS: {
        COMMISSION: 'commission',
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
    INVOICE_BILLING_REASON:{
        SUBSCRIPTION_CREATE: `subscription_create`,
        SUBSCRIPTION_CYCLE: `subscription_cycle`,
        CHECKOUT: `checkout`,
        MANUAL: `manual`
    },
    INVOICE_PAYMENT_METHOD_TYPE:{
        IDEAL: `ideal`,
        SEPA_DEBIT: `sepa_debit`,
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
        PENDING: `PENDING`, // it means that money is still under stripe 
        IN_TRANSIT: `IN_TRANSIT`,
        PAID: `PAID`,
        FAILED: `FAILED`,
        NOT_INITIATED: `NOT_INITIATED`,
        CANCELED: `CANCELED`,
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
    },
    INTERNATIONALIZATION_LANGUAGE: {
        DUTCH: "nl",
        ENGLISH: "en"
    },
    PLATFORM:{
        MOBILE:'mobile',
        WEBSITE:"website"
    },
    SPEED_BANDS :   [
                        { max: 20, value: 15 },
                        { max: 60, value: 30 },
                        { max: Infinity, value: 50 },
                    ],
    VEHICLE_UPDATE_STATUS : {
        PENDING: 'PENDING',
        APPROVED: 'APPROVED',
        REJECTED: 'REJECTED',
        REVOKED: 'REVOKED',     // ← NEW
        NONE: 'NONE',     // ← NEW
    },
    // this will explain the request is creating time or updating time
    VEHICLE_UPDATE_ACTION : {
        CREATE: 'CREATE',   // first time vehicle
        UPDATE: 'UPDATE',   // update existing
    }
}