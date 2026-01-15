require("dotenv").config();
const https = require("https");
const TRIP_MODEL = require("../models/user/trip_model.js");
const USER_MODEL = require("../models/user/user_model");
const CONSTANT = require("../config/constant.js");
const { toCents, getAvailableCentsFor, sleep , toConstantCase} = require('../utils/money');
const { notifyInsufficientBalance } = require("./helperFuntion");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY , {
  timeout: 120000,          // 120s
  maxNetworkRetries: 3,     // retries on transient errors/timeouts
  httpAgent: new https.Agent({ keepAlive: true }),
});


// =======================
// ✅ RETRY BACKOFF HELPER
// =======================
exports.computeNextRetryAt = async (attempts) => {
  // 1->5m, 2->15m, 3->60m, 4->6h, 5+->24h
  const minutesMap = [5, 15, 60, 360, 1440];
  const minutes = minutesMap[Math.min(Math.max(attempts, 1) - 1, minutesMap.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
}

/**
 * ✅ Fetch trips eligible for processing with retry support.
 * - NOT_INITIATED uses transfer.next_retry_at
 * - TRANSFER_CREATED uses payout.next_retry_at
 */
exports.getPendingPayoutTripsBeforeWeek = async (companyTripPayoutStatus) => {
  try {

    const now = new Date();
    const sevenDaysAgo = new Date();
    // console.log(`sevenDaysAgo--------` , sevenDaysAgo)
    // sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);

    // ✅ Choose retry field based on stage
    const retryField =
      companyTripPayoutStatus === CONSTANT.PAYOUT_TANSFER_STATUS.TRANSFER_CREATED
        ? "payout.next_retry_at"
        : "transfer.next_retry_at";

    //  get the trips who have account attached with stripe then we can also transfer into his account
    const trips = await TRIP_MODEL.aggregate([
                                              {
                                                $match: { 
                                                          trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                          // is_paid: true,
                                                          is_company_paid: false,
                                                          company_trip_payout_status: companyTripPayoutStatus,
                                                          // pickup_date_time: { $lt: sevenDaysAgo },

                                                          // ✅ must have amount
                                                          companyPaymentAmount: { $exists: true, $gt: 0 },

                                                          // ✅ retry gate: next_retry_at is null/missing OR due now
                                                          $or: [
                                                            { [retryField]: { $exists: false } },
                                                            { [retryField]: null },
                                                            { [retryField]: { $lte: now } },
                                                          ],
                                                        } 
                                              },
                                              {
                                                $lookup: {
                                                  from: "users", 
                                                  let: { companyId: "$created_by_company_id" }, // Use trip's `created_by_company_id`
                                                  pipeline: [
                                                    {
                                                      $match: {
                                                        $expr: { $eq: ["$_id", "$$companyId"] }, // Match `user._id` with `created_by_company_id`
                                                        isAccountAttched: CONSTANT.CONNECTED_ACCOUNT.ACCOUNT_ATTACHED_STATUS.ACCOUNT_ATTACHED, // Filter users where `isAccountAttched: true`
                                                        connectedAccountId: { $exists: true, $ne: "", $ne: null }
                                                      }
                                                    }
                                                  ],
                                                  as: "companyDetails"
                                                }
                                              },
                                              { $unwind: "$companyDetails" }, // Remove trips without a matching company
                                              {
                                                $project: {
                                                  _id: 1,
                                                  created_by_company_id: 1,
                                                  trip_id:1,
                                                  pickup_date_time: 1,
                                                  is_company_paid:1,
                                                  companyPaymentAmount:1,
                                                  price:1,
                                                  driverPaymentAmount:1,
                                                  child_seat_price:1,
                                                  payment_method_price:1,
                                                  transfer: 1,
                                                  "companyDetails.connectedAccountId": 1,
                                                  "companyDetails.stripeCustomerId": 1,
                                                  "companyDetails.email": 1,
                                                }
                                              }
                                            ]);

    return trips
  } catch (error) {
    
    console.log("❌❌❌❌❌❌❌❌❌Error getPendingPayoutTripsBeforeWeek:",  error.message);
    return [];
    // throw error;
  }
}

// =======================
// ✅ STRIPE HELPERS
// =======================
exports.transferToConnectedAccount = async (amountCents, connectedAccountId , tripId) => {

  try {

    const transfer = await stripe.transfers.create(     
                                                        {
                                                            amount: amountCents, // Amount in cents (e.g., $10 = 1000) 
                                                            currency: "eur",
                                                            destination: connectedAccountId, // Connected account ID
                                                            transfer_group: String(tripId), // Optional: Group for tracking,
                                                            description:  `Payout for trip ${tripId}`,
                                                            metadata: { tripId: String(tripId) },
                                                        }, 
                                                        { 
                                                            idempotencyKey: `transfer:${tripId}` // The idempotencyKey prevents duplicate charges/transfers in case of retries or failures. It guarantees that a single unique operation only happens once.
                                                        }
                                                    ); 

    console.log("Transfer Successful:---------", transfer);
    return transfer;
  } catch (error) {
    console.log("❌❌❌❌❌❌❌❌❌Error transfer to connect account:",  error.message);
    
    throw error;
  }
}


exports.createConnectedPayout = async (amountCents, connectedAccountId, tripId) => {
  try {
      const payout = await stripe.payouts.create(
                                                    {
                                                        amount: amountCents, // Amount in cents (e.g., 1000 = €10.00)
                                                        currency: 'eur', // Currency
                                                        statement_descriptor: `Trip ${tripId}`.slice(0, 22), // lenth limit is 22 character
                                                        metadata: { tripId: String(tripId) },
                                                    },
                                                    {
                                                        stripeAccount: connectedAccountId, // The connected account ID
                                                        idempotencyKey: `payout:${tripId}`,
                                                    }
                                                );
      
      console.log('Payout Successful:', payout);
      return payout;
  } catch (error) {
    console.log("❌❌❌❌❌❌❌❌❌Error create connected payout:",  error.message);
     
    throw error;
  }
}

exports.computeTripCompanyAmount = (trip) => {
    return ( Number(trip.companyPaymentAmount) || 0);
}

// =======================================
// ✅ BATCH 1: PLATFORM -> CONNECTED TRANSFER
// =======================================
exports.runCompanyTransfersBatch  = async () => {
  try {
      const platformBal = await stripe.balance.retrieve();
      let platformEurCents = getAvailableCentsFor(platformBal, 'eur');

      const trips = await exports.getPendingPayoutTripsBeforeWeek(CONSTANT.PAYOUT_TANSFER_STATUS.NOT_INITIATED);

      if (!trips.length) {
          // console.log('No eligible trips for payout.----' , new Date());
          return;
      }


      if (platformEurCents < 100) { // < €1
          console.log('Insufficient platform EUR balance for transfers.');
          await notifyInsufficientBalance()
          return;
      }


      for (const trip of trips) {
          
        const tripId = trip.trip_id;

        try {

          const amountEur = await exports.computeTripCompanyAmount(trip);
          if (amountEur < 1) continue;


          
          const connectedAccountId = trip.companyDetails.connectedAccountId;
          const stripeCustomerId = trip.companyDetails.stripeCustomerId;
          const amountCents = await toCents(amountEur);

          if (amountCents < 100) continue;
          if (platformEurCents < amountCents) {
           
            console.log('❌❌❌❌❌❌❌❌❌--Platform balance fell below required amount; stopping batch.');
            await notifyInsufficientBalance()
            break;
          }

          // const latest = await stripe.balance.retrieve();

          // ✅ mark attempt + lock (INT increment)
          await TRIP_MODEL.updateOne(
                                      { _id: trip._id },
                                      {
                                        $set: { "transfer.locked_at": new Date() },
                                        $inc: { "transfer.attempts": 1 },
                                      }
                                    );

          // a) TRANSFER
          const transfer = await exports.transferToConnectedAccount(amountCents, connectedAccountId, tripId );
          await TRIP_MODEL.updateOne(
                                      { _id: trip._id }, 
                                      {
                                          $set:   {
                                                    'transfer.id': transfer.id ?? null,                                  // tr_...
                                                    'transfer.amount': typeof transfer.amount === 'number' ? transfer.amount : null, // cents
                                                    'transfer.currency': transfer.currency ?? null,
                                                    'transfer.destination': transfer.destination ?? null,                 // acct_...
                                                    'transfer.transfer_group': transfer.transfer_group ?? null,           // e.g., tripId
                                                    'transfer.balance_transaction': transfer.balance_transaction ?? null, // txn_...
                                                    'transfer.created': new Date(),                                      // Date
                                                    'transfer.destination_payment': transfer.destination_payment ?? null, // optional
                                                    'transfer.reversals': transfer?.reversals,
                                                    "transfer.last_error": null,
                                                    "transfer.last_error_at": null,
                                                    "transfer.next_retry_at": null,
                                                    company_trip_payout_status: CONSTANT.PAYOUT_TANSFER_STATUS.TRANSFER_CREATED                                       // array of ids (or empty)
                                                  } 
                                      }
                                  );
                                
          platformEurCents -= amountCents;
          
          console.log('Transfer created', { tripId, transferId: transfer.id });

        } catch (err) {
        
          // ✅ schedule retry
          const attempts = Number(trip.transfer?.attempts || 0) + 1; // +1 because we incremented in DB too
          const nextRetryAt = await exports.computeNextRetryAt(attempts);
          
          await TRIP_MODEL.updateOne(
                                      { _id: trip._id },
                                      {
                                        $set: {
                                          "transfer.last_error": err.message,
                                          "transfer.last_error_at": new Date(),
                                          "transfer.next_retry_at": nextRetryAt,

                                          // keep it retryable
                                          company_trip_payout_status:
                                            CONSTANT.PAYOUT_TANSFER_STATUS.NOT_INITIATED,
                                        },
                                      }
                                    );

        }
          
      }
  } catch (e) {

    console.log("❌❌❌❌❌❌❌❌❌Error runPayoutsBatch:",  { err: e.message, stack: e.stack });
   
  }
}

// =======================================
// ✅ BATCH 2: CONNECTED -> BANK PAYOUT
// =======================================
exports.runCompanyPayoutsBatch = async () => {

  try {

  
    const trips = await exports.getPendingPayoutTripsBeforeWeek(CONSTANT.PAYOUT_TANSFER_STATUS.TRANSFER_CREATED);

    if (!trips.length) {
        // console.log('No eligible trips for payout.----' , new Date());
        return;
    }

    for (const trip of trips) {
      
      const tripId = trip.trip_id;
      
      try {

        const amountEur = await exports.computeTripCompanyAmount(trip);
        if (amountEur < 1) continue;

        const connectedAccountId = trip.companyDetails.connectedAccountId;
        const stripeCustomerId = trip.companyDetails.stripeCustomerId;
        const amountCents = await toCents(amountEur);

        if (amountCents < 100) continue;

        // ✅ Check if THIS transfer is available on connected (NO POLLING)
        const transferBalanceTransactionId  = trip.transfer?.balance_transaction;
      
        if (!transferBalanceTransactionId) {
          console.log("❌ Missing transfer balance_transaction", { tripId });
          continue;
        }

        const available = await exports.isTransferAvailableOnConnected({
                                                                connectedAccountId,
                                                                transferBalanceTransactionId ,
                                                              });

        if (!available) {
          console.log("⏳ Transfer not available yet, will retry later", { tripId });
          continue;
        }

        // ✅ mark attempt + lock (INT increment)
        await TRIP_MODEL.updateOne(
                                    { _id: trip._id },
                                    {
                                      $set: { "payout.locked_at": new Date() },
                                      $inc: { "payout.attempts": 1 },
                                    }
                                  );

        const payout = await exports.createConnectedPayout(amountCents, connectedAccountId, tripId );

        await TRIP_MODEL.updateOne({ _id: trip._id },   {
                                                            $set:   {
                                                                        'payout.id': payout.id,
                                                                        'payout.amount': payout.amount,
                                                                        'payout.currency': payout.currency,
                                                                        'payout.status': CONSTANT.PAYOUT_TANSFER_STATUS[toConstantCase(payout.status)],
                                                                        'payout.arrival_date': payout.arrival_date ? new Date(payout.arrival_date * 1000) : null,
                                                                        'payout.balance_transaction': payout.balance_transaction || null,
                                                                        'payout.method': payout.method || 'standard',
                                                                        'payout.destination': payout.destination || null,
                                                                        'payout.statement_descriptor': payout.statement_descriptor || null,
                                                                        'payout.created': payout.created ? new Date(payout.created * 1000) : new Date(),
                                                                        'payout.initiated_date': new Date(),
                                                                        // ✅ clear retry/error
                                                                        "payout.last_error": null,
                                                                        "payout.last_error_at": null,
                                                                        "payout.next_retry_at": null,
                                                                        company_trip_payout_status: CONSTANT.PAYOUT_TANSFER_STATUS.PAYOUT_INITIATED
                                                                    },
                                                        }
                                    );


        console.log('Payout initiated',  payout);
      } catch (err) {
        const attempts = Number(trip.payout?.attempts || 0) + 1;
        const nextRetryAt = await exports.computeNextRetryAt(attempts);

        await TRIP_MODEL.updateOne(
                                    { _id: trip._id },
                                    {
                                      $set: {
                                        "payout.last_error": err.message,
                                        "payout.last_error_at": new Date(),
                                        "payout.next_retry_at": nextRetryAt,

                                        // payout retries happen while staying in TRANSFER_CREATED stage
                                        company_trip_payout_status:
                                          CONSTANT.PAYOUT_TANSFER_STATUS.TRANSFER_CREATED,
                                      },
                                    }
                                  );
      }
        
    }

  } catch (e) {
    console.log("❌❌❌ runCompanyPayoutsBatch error:", { err: e.message, stack: e.stack });
  }   
}

exports.isTransferAvailableOnConnected = async ({ connectedAccountId, transferBalanceTransactionId }) => {
  const balanceTransaction = await stripe.balanceTransactions.retrieve(
    transferBalanceTransactionId,
    { stripeAccount: connectedAccountId }
  );

  const availableAtMs = (balanceTransaction.available_on || 0) * 1000;
  return Date.now() >= availableAtMs;
};


