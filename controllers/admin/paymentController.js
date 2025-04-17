const { default: mongoose } = require("mongoose");
const {
  initiateStripePayment,
  checkPaymentStatus,
} = require("../../Service/Stripe");
const constant = require("../../config/constant");
const agency_model = require("../../models/user/agency_model");
const transaction = require("../../models/user/transaction");
const SETTING_MODEL = require("../../models/user/setting_model");
const SUBSCRIPTION_MODEL = require("../../models/user/subscription_model");
// const transaction = require("../../models/user/transaction");
const TRIP = require("../../models/user/trip_model");
const user_model = require("../../models/user/user_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getUserActivePaidPlans} = require("../../Service/helperFuntion");

exports.tripCommissionPayment = async (req, res) => {
  try {
    let tripId = req.params.id;
    const trip_by_id = await TRIP.findById(tripId);

    if (!trip_by_id) {
      return res.send({
                        code: constant.error_code,
                        message: "Unable to get the trip by id",
                      });
    }
    if (trip_by_id.is_paid) {
      return res.send({
                        code: constant.error_code,
                        message: "Already paid",
                      });
    }

    try {
      let commission = trip_by_id.commission.commission_value;

      if ( trip_by_id.commission.commission_type === "Percentage" && trip_by_id.commission.commission_value > 0 ) {
        commission = (trip_by_id.price * trip_by_id.commission.commission_value) / 100;
      }
      commission = commission.toFixed(2);

      const paymentResult = await initiateStripePayment( trip_by_id, parseInt(commission * 100) );
      res.send({
                  code: constant.success_code,
                  result: paymentResult,
                  trip_by_id,
                  message: "Success fully payment is created",
                  // commission
                });
    } catch (error) {
      return res.send({
                        code: constant.error_code,
                        message: "Error while creating payment",
                      });
    }
  } catch (err) {
    
    console.log("🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:",err);

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.failedTripPay = async (req, res) => {
  try {
    let tripId = req.params.id;
    const trip_by_id = await TRIP.findById(tripId);
    if (!trip_by_id) {
      return res.send({
        code: constant.error_code,
        message: "Unable to get the trip by id",
      });
    }
    // if (trip_by_id.is_paid) {
    //   return res.send({
    //     code: constant.error_code,
    //     message: "Already paid",
    //   });
    // }
    trip_by_id.is_paid = false;
    trip_by_id.stripe_payment.payment_status = "Failed";
    await trip_by_id.save();
    res.send({
      result: trip_by_id,
      code: constant.success_code,
      message: "Payment failed",
    });
  } catch (err) {
    console.log(
      "🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:",
      err
    );

    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.successTripPay = async (req, res) => {
  try {
    let tripId = req.params.id;
    const trip_by_id = await TRIP.findById(tripId);

    if (!trip_by_id) {
      return res.send({
                        code: constant.error_code,
                        message: "Unable to get the trip by id",
                      });
    }

    if (trip_by_id.is_paid) {

      return res.send({
                        code: constant.error_code,
                        message: "Already paid",
                      });
    }

    // check from strip side is payment completed
    try {
      const resultFromStipe = await checkPaymentStatus( trip_by_id?.stripe_payment?.payment_intent_id );

      if (resultFromStipe.payment_status === "paid") {

        // const invoice = await stripe.invoices.retrieve(resultFromStipe.invoice);

        // // getting the invice URL from the stripe if the payment has been made online
        // if (invoice) {
        //   trip_by_id.hosted_invoice_url = invoice?.hosted_invoice_url ? invoice?.hosted_invoice_url : '';
        //   trip_by_id.invoice_pdf = invoice?.invoice_pdf ? invoice?.invoice_pdf : '';
        // }
        trip_by_id.is_paid = true;
        trip_by_id.stripe_payment.payment_status = "Paid";
        trip_by_id.payment_completed_date = new Date();
        trip_by_id.payment_collcted = constant.PAYMENT_COLLECTION_TYPE.ONLINE;
        
        await trip_by_id.save();
        
        let commission = trip_by_id.commission.commission_value;

        if ( trip_by_id.commission.commission_type === "Percentage" && trip_by_id.commission.commission_value > 0 ) {

          commission = (trip_by_id.price * trip_by_id.commission.commission_value) / 100;
        }

        const customer = await user_model.findOne({ _id: trip_by_id.created_by, });

        const companyData = await user_model.findOne({ _id: trip_by_id.created_by_company_id, });
        const company = await agency_model.findOne({ user_id: companyData._id });

        const superAdmin = await user_model.findOne({ role: "SUPER_ADMIN" });
        
        const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISION});

        const myPlans = await getUserActivePaidPlans(companyData);
        const superAdminCommission = (myPlans.length > 0 || companyData?.is_special_plan_active)? 0 : ((commission * parseFloat(adminCommision.value)) / 100 || 0);

        const companyTransaction = new transaction({
                                                      from: trip_by_id.driver_name,
                                                      to: companyData._id,
                                                      amount: commission - superAdminCommission,
                                                      trip: trip_by_id._id,
                                                      type: "credit",
                                                    });
        await companyTransaction.save();
        const superTransaction = new transaction({
                                                    from: trip_by_id.driver_name,
                                                    to: superAdmin._id,
                                                    amount: superAdminCommission,
                                                    trip: trip_by_id._id,
                                                    type: "credit",
                                                  });
        await superTransaction.save();
        const companyBalance = companyData.totalBalance + commission - superAdminCommission;

        const updateCompanyWallet = await user_model.updateOne(
                                                                  { _id: companyData._id },
                                                                  { $set: { totalBalance: companyBalance } }
                                                                );

        const superBalance = superAdmin.totalBalance + superAdminCommission;

        const updateSuperWallet = await user_model.updateOne(
                                                              { _id: superAdmin._id },
                                                              { $set: { totalBalance: superBalance } }
                                                            );

        console.log('success payment-------' , {
          result: trip_by_id,
          code: constant.success_code,
          message: "Payment Paid",
          resultFromStipe,
        })
        return res.send({
                          result: trip_by_id,
                          code: constant.success_code,
                          message: "Payment Paid",
                          resultFromStipe,
                        });
      } else {
        
        trip_by_id.is_paid = false;
        trip_by_id.stripe_payment.payment_status = "Failed";
        await trip_by_id.save();

         console.log('failure payment-------', {
          result: trip_by_id,
          code: constant.error_code,
          message: "Payment Not Paid Yet",
        })
        res.send({
                    result: trip_by_id,
                    code: constant.error_code,
                    message: "Payment Not Paid Yet",
                  });
      }
    } catch (error) {
      throw error;
    }
  } catch (err) {
    console.log( "🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:", err );

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.payCompany = async (req, res) => {
  try {
    // if(req.role !== "SUPER_ADMIN")  return res.send({
    //   code: constant.error_code,
    //   message: "Your are not a SUPER ADMIN",
    // });
    const amount = parseFloat(req.body.amount);
    if (isNaN(amount) || !amount)
      return res.send({
        code: constant.error_code,
        message: "Amount must be a number and greater than zero",
      });

    const company = await user_model.findById(req.body.company_id);

    if (!company)
      return res.send({
        code: constant.error_code,
        message: "Company not found",
      });
    const newTransaction = new transaction({
      to: company._id,
      from: req.userId,
      amount: req.body.amount,
      fromType: "SUPER_ADMIN",
      type: "credit",
    });
    if (req.body.amount > company.totalBalance)
      return res.send({
        code: constant.error_code,
        message: "Amount should be less than total balance",
      });
    const updateCompany = user_model.updateOne(
      { _id: company._id },
      {
        $set: {
          totalBalance: company.totalBalance - amount,
        },
      }
    );

    const result = await Promise.all([newTransaction.save(), updateCompany]);
    res.send({
      code: constant.success_code,
      message: "You paid company commission successfully",
      transaction: newTransaction,
    });
  } catch (err) {
    console.log(
      "🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:",
      err
    );

    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getCommissionTrans = async (req, res) => {
  try {
    const user = await user_model.findById(req.userId);
    const query =
      req.query.role == "SUPER_ADMIN"
        ? {
            from: new mongoose.Types.ObjectId(req.userId),
            fromType: "SUPER_ADMIN",
          }
        : {
            to: new mongoose.Types.ObjectId(req.userId),
            fromType: "SUPER_ADMIN",
          };
    const allSuperTrans = transaction.aggregate([
      {
        $match: query,
      },
      {
        $sort: {
          createdAt: -1,
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "to",
          foreignField: "_id",
          as: "company",
        },
      },
      {
        $unwind: {
          path: "$company",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "company._id",
          foreignField: "user_id",
          as: "companyData",
        },
      },
      {
        $unwind: {
          path: "$companyData",
        },
      },
    ]);
    const allDriverTrans = transaction
      .find({
        to: req.userId,
        fromType: "DRIVER",
      })
      .populate("trip")
      .populate("from")
      .sort({
        createdAt: -1,
      });
    const getTotalAmount = async (startDate) => {
      const amount = await transaction.aggregate([
        {
          $match: {
            to: new mongoose.Types.ObjectId(req.userId),
            fromType: "DRIVER",
          },
        },
        {
          $match: {
            createdAt: { $gte: new Date(startDate) },
          },
        },
        {
          $group: {
            _id: null,
            totalEarnings: {
              $sum: "$amount",
            },
          },
        },
      ]);

      return amount[0]?.totalEarnings || 0;
    };

    const result = await Promise.all([allSuperTrans, allDriverTrans]);
    const date = new Date();
    res.send({
      code: constant.success_code,
      message: "You paid company commission successfully",
      allSuperTrans: result[0],
      allDriverTrans: result[1],
      totalBalance: user.totalBalance,
      totalEarning: await getTotalAmount(
        new Date(1, 1, 1).setHours(0, 0, 0, 0)
      ),
      totalEarningLastSevenDays: await getTotalAmount(
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0)
      ),
      totalEarningFromMonth: await getTotalAmount(
        new Date(date.getFullYear(), date.getMonth(), 1).setHours(0, 0, 0, 0)
      ),
      totalEarningFromYear: await getTotalAmount(
        new Date(date.getFullYear(), 1, 1).setHours(0, 0, 0, 0)
      ),
    });
  } catch (err) {
    console.log(
      "🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:",
      err
    );

    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};


exports.adminTransaction = async (req, res) => {
  try {

    let data = req.body;
    let dateFilter = data.dateFilter; // Corrected variable name
    if (!['all', 'this_week', 'this_month', 'this_year', 'dateRange'].includes(dateFilter)) {
      dateFilter = "all";
    }

    // Update the query based on the date filter
    let dateQuery = {};

    if (dateFilter !== "all") {
      let startDate, endDate;
      const today = new Date();
      switch (dateFilter) {
        case "this_week":
          const todayDay = today.getDay();
          startDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() - todayDay
          );
          endDate = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate() + (6 - todayDay)
          );
          break;
        case "this_month":
          startDate = new Date(today.getFullYear(), today.getMonth(), 1);
          endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
          break;
        case "this_year":
          startDate = new Date(today.getFullYear(), 0, 1);
          endDate = new Date(today.getFullYear(), 11, 31);
          break;
        case "dateRange":
          startDate = new Date(req.body.startDate);
          endDate = new Date(req.body.endDate);

          // Modify the Date object with setHours
          
        default:
          break;
      }

      startDate.setUTCHours(0, 0, 1, 0);
      endDate.setUTCHours(23, 59, 59, 999);

      // Convert the Date objects to ISO 8601 strings
      startDate = startDate.toISOString();
      endDate = endDate.toISOString();

      dateQuery = { createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) } };
    }

    const totalAmountPurchasedPlan = await getTotalPurchasedSubscriptionAmount();
    const paidTripCommisionOfadmin = await getTotalPayment(dateQuery , {is_paid: true} , `superAdminPaymentAmount` , false);
    const DuesTripCommisionOfadmin = await getTotalPayment(dateQuery , {is_paid: false} , `superAdminPaymentAmount` , false);
    const commisionPaidToCompany = await getTotalPayment(dateQuery , {is_paid: true , is_company_paid: true } , `companyPaymentAmount` , false);
    const companyCommisionToBePaid = await getTotalPayment(dateQuery , {is_paid: true , is_company_paid: false } , `companyPaymentAmount` , false);

    const dueCommisionFromDrivers = await getTotalPayment(dateQuery , { is_paid: false } , `driverPaymentAmount` , true);
    const recieveCommisionFromDrivers = await getTotalPayment(dateQuery , { is_paid: true} , `driverPaymentAmount` , true);

    const driversNetEarning = await getTotalPayment(dateQuery , { is_paid: true} , `driverPaymentAmount` , false);
    
    
    const countDriversWithPendingDues  = await TRIP.countDocuments({trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: false});
    const countDriversWithPaidDues  = await TRIP.countDocuments({trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: true});



    res.send({
              code: constant.success_code,

              totalAmountPurchasedPlan,
              paidTripCommisionOfadmin,
              DuesTripCommisionOfadmin,
              commisionPaidToCompany,
              companyCommisionToBePaid,
              dueCommisionFromDrivers,
              recieveCommisionFromDrivers,
              countDriversWithPendingDues,
              countDriversWithPaidDues,
              driversNetEarning

            });

  } catch (err) {
    console.log( "🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:", err );
    res.send({
              code: constant.error_code,
              message: err.message,
            });
  }

}

const getTotalPurchasedSubscriptionAmount = async () => {
  try {

    const totalAmount  = await SUBSCRIPTION_MODEL.aggregate([
                                                                {
                                                                    $match: { paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID }
                                                                },
                                                                {
                                                                    $group: {
                                                                        _id: null,
                                                                        totalAmount: { $sum: "$amount" }
                                                                    }
                                                                }
                                                            ]);

    const total = totalAmount.length > 0 ? totalAmount[0].totalAmount.toFixed(2) : 0;
    return total
  } catch (err) {
    console.log(
      "🚀 ~ function: fetchTotalAmountPurchasedPlans ~ err:",
      err
    );

    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

const getTotalPayment = async (dateQuery = null , type = null  , amountKey = 'superAdminPaymentAmount' , revenueOnly = false) => {

  let matchCriteria = {
      status: true,
      trip_status: constant.TRIP_STATUS.COMPLETED,
      is_deleted: false,
      ...(dateQuery || {}),
      ...(type || {}),
  }

  let groupStage ;

  if (revenueOnly) {
    groupStage = {
      $group: {
        _id: null,
        totalAmount: {
          $sum: {
            $subtract: ['$price', '$driverPaymentAmount']
          }
        }
      }
    };
  } else {
    groupStage = {
      $group: {
        _id: null,
        totalAmount: {
          $sum: `$${amountKey}`
        }
      }
    };
  }
  
  const totalPayment = await TRIP.aggregate([
    {
        $match: matchCriteria
    },
    groupStage
  ]);

  return totalPayment.length > 0 ? totalPayment[0].totalAmount.toFixed(2) : 0;
};

exports.adminUpdatePayment = async (req, res) => {

  try {

    
    let tripId = req.params.id;

    const tripInfo = await TRIP.findById(tripId);

    if (tripInfo?.is_paid && req.user.role == constant.ROLES.ADMIN) {

      return res.send({
                        code: constant.error_code,
                        message: `This trip already paid`,
                        
                      });
    } else {

      let criteria = { _id: tripId };
      let newValue = {
                        $set: {
                          is_paid : !tripInfo?.is_paid,
                          "stripe_payment.payment_status" : "Paid",
                          payment_completed_date : new Date(),
                          payment_collcted : constant.PAYMENT_COLLECTION_TYPE.MANUALLY,
                          payment_upadted_by_admin: tripInfo?.is_paid ? null : req.userId,
                        },
                      };

                     
      let option = { new: true };
      let trip = await TRIP.findByIdAndUpdate(criteria, newValue, option);

      if (trip) {

        return res.send({
                          code: constant.success_code,
                          data: trip,
                          message: `This trip payment status has been updated`,
                        });
      } else {
        return res.send({
                          code: constant.error_code,
                          message: err.message,
                        });
      }
    }
      
        

  } catch (err) {
    console.log( "🚀 ~ file: adminUpdatePayment.", err.message );

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}
