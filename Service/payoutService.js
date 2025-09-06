require("dotenv").config();
const TRIP_MODEL = require("../models/user/trip_model.js");
const user_model = require("../models/user/user_model");
const constant = require("../config/constant.js");
const { toCents, getAvailableCentsFor, sleep } = require('../utils/money');
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

exports.getPendingPayoutTripsBeforeWeek = async () => {
  try {

    const sevenDaysAgo = new Date();
    console.log(`sevenDaysAgo--------` , sevenDaysAgo)
    // sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 2);

    //  get the trips who have account attached with stripe then we can also transfer into his account
    const trips = await TRIP_MODEL.aggregate([
                                              {
                                                $match: { 
                                                          trip_status: constant.TRIP_STATUS.COMPLETED,
                                                          // is_paid: true,
                                                          is_company_paid: false,
                                                          company_trip_payout_status: constant.PAYOUT_TANSFER_STATUS.NOT_INITIATED,
                                                          // pickup_date_time: { $lt: sevenDaysAgo },
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
                                                        connectedAccountId: { $ne: ""  }
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
                                                  "companyDetails.connectedAccountId": 1,
                                                  "companyDetails.stripeCustomerId": 1,
                                                  "companyDetails.email": 1,
                                                }
                                              }
                                            ]);

    return trips
  } catch (error) {
    console.error("Error getPendingPayoutTripsBeforeWeek:", error);
    throw error;
  }
}


exports.transferToConnectedAccount = async (amount, connectedAccountId , tripId) => {

  try {

    const transfer = await stripe.transfers.create(     
                                                        {
                                                            amount: toCents(amount), // Amount in cents (e.g., $10 = 1000) 
                                                            currency: "eur",
                                                            destination: connectedAccountId, // Connected account ID
                                                            transfer_group: tripId, // Optional: Group for tracking,
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
    console.error("Error Transfer balance:", error.message);
    throw error;
  }
}

exports.waitUntilFundsOnConnected = async ({ connectedAccountId, amountEur, tries = 5, delayMs = 2000 }) => {
    const need = toCents(amountEur);
    for (let i = 0; i < tries; i++) {
    const bal = await stripe.balance.retrieve({ stripeAccount: connectedAccountId });
    const have = getAvailableCentsFor(bal, 'eur');
    if (have >= need) return true;
    await sleep(delayMs);
    }
    return false;
}


exports.createConnectedPayout = async (amountEur, connectedAccountId, tripId) => {
  try {
      const payout = await stripe.payouts.create(
                                                    {
                                                        amount: toCents(amountEur), // Amount in cents (e.g., 1000 = €10.00)
                                                        currency: 'eur', // Currency
                                                        statement_descriptor: `Trip ${tripId}`,
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
      console.error('Error sending payout:', error);
      throw error;
  }
}

exports.computeTripCompanyAmount = (trip) => {
    return (
        (Number(trip.companyPaymentAmount) || 0) +
        (Number(trip.child_seat_price) || 0) +
        (Number(trip.payment_method_price) || 0)
    );
}

exports.runPayoutsBatch  = async () => {
try {
    const platformBal = await stripe.balance.retrieve();
    const platformEur = getAvailableCentsFor(platformBal, 'eur');

    const trips = await getPendingPayoutTripsBeforeWeek();


    if (!trips.length) {
        console.log('No eligible trips for payout.----' , new Date());
        return;
    }


    if (platformEur < 100) { // < €1
        console.log('Insufficient platform EUR balance for transfers.');
        return;
    }


    for (const trip of trips) {
        
        const amountEur = await this.computeTripCompanyAmount(trip);
        if (amountEur < 1) continue;


        const tripId = trip.trip_id;
        const connectedAccountId = trip.companyDetails.connectedAccountId;
        const stripeCustomerId = trip.companyDetails.stripeCustomerId;


        const latest = await stripe.balance.retrieve();
        if (getAvailableCentsFor(latest, 'eur') < toCents(amountEur)) {
            
            console.log('Platform balance fell below required amount; stopping batch.');
            break;
        }


        // a) TRANSFER
        const transfer = await this.transferToConnectedAccount(amountEur, connectedAccountId, tripId );
        await TRIP_MODEL.updateOne(
                                    { _id: trip._id }, 
                                    {
                                        $set:   {
                                                    stripe_transfer_id: transfer.id,
                                                    stripe_transfer_balance_txn: transfer.balance_transaction || null,
                                                },
                                    }
                                );
        console.log('Transfer created', { tripId, transferId: transfer.id });


        // b) WAIT for funds on connected
        const ok = await this.waitUntilFundsOnConnected({ connectedAccountId, amountEur });
        if (!ok) {
            console.log('Funds not yet available on connected; payout will be retried later', { tripId, connectedAccountId });
            continue;
        }


        // c) PAYOUT
        const payout = await this.createConnectedPayout(amountEur, connectedAccountId, tripId );


        // d) SAVE reconciliation anchors
        await TRIP_MODEL.updateOne({ _id: trip._id },   {
                                                            $set:   {
                                                                        company_trip_payout_id: payout.id,
                                                                        company_trip_payout_status: PAYOUT_STATUS.PENDING,
                                                                        company_trip_payout_initiated_date: new Date().toISOString(),
                                                                        company_trip_payout_balance_txn: payout.balance_transaction || null,
                                                                    },
                                                        }
                                    );


        console.log('Payout initiated', { tripId, payoutId: payout.id });
    }
} catch (e) {
await logError('runPayoutsBatch failed', { err: e.message, stack: e.stack });
}
}
