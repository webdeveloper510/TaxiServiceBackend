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
const DRIVER_MODEL = require("../../models/user/driver_model");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getUserActivePaidPlans , dateFilter , generateInvoiceReceipt} = require("../../Service/helperFuntion");

exports.tripCommissionPayment = async (req, res) => {
  try {
    let tripId = req.params.id;
    const trip_by_id = await TRIP.findById(tripId);

    if (!trip_by_id) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('tripCommissionPayment.error.invalidTrip'),
                      });
    }
    if (trip_by_id.is_paid) {
      return res.send({
                        code: constant.error_code,
                        message: res.__('tripCommissionPayment.error.tripCommissionAlreadyPaid'),
                      });
    }

    try {
      let commission = trip_by_id.commission.commission_value;

      if ( trip_by_id.commission.commission_type === "Percentage" && trip_by_id.commission.commission_value > 0 ) {
        commission = (trip_by_id.price * trip_by_id.commission.commission_value) / 100;
      }
      commission = commission.toFixed(2);

      const paymentResult = await initiateStripePayment( trip_by_id, parseInt(commission * 100) , req);
      res.send({
                  code: constant.success_code,
                  result: paymentResult,
                  trip_by_id,
                  message: res.__('tripCommissionPayment.success.paymentLinkGenerated'),
                });
    } catch (error) {

      console.log('❌❌❌❌❌❌❌❌❌ tripCommissionPayment.error.paymentFailed error --------------' , error.message)
      return res.send({
                        code: constant.error_code,
                        message: res.__('tripCommissionPayment.error.paymentFailed'),
                      });
    }
  } catch (err) {
    
    console.log("❌❌❌❌❌❌❌❌❌🚀 ~ file: paymentController.js:37 ~ exports.tripCommissionPayment= ~ err:",err.message);

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
        message: res.__('failedTripPay.error.invalidTrip'),
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
      message:  res.__('failedTripPay.error.paymentFailed'),
    });
  } catch (err) {
    console.log(
      "❌❌❌❌❌❌❌❌❌🚀 ~ failed trip pay= ~ err:",
      err.message
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
                        message: res.__('successTripPay.error.invalidTrip'),
                      });
    }

    if (trip_by_id.is_paid) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('successTripPay.error.tripCommissionAlreadyPaid'),
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
        
        await TRIP.updateOne(
                              {_id: trip_by_id._id}, 
                              {
                                $set: { 
                                        is_paid: constant.DRIVER_TRIP_PAYMENT.PAID, 
                                        "stripe_payment.payment_status": "Paid",
                                        payment_completed_date: new Date(),
                                        payment_collcted: constant.PAYMENT_COLLECTION_TYPE.ONLINE
                                      }
                              }
                            );

        // await trip_by_id.save();
        
        let commission = trip_by_id.commission.commission_value;

        if ( trip_by_id.commission.commission_type === "Percentage" && trip_by_id.commission.commission_value > 0 ) {

          commission = (Number(trip_by_id.price) * Number(trip_by_id.commission.commission_value)) / 100;
        }

        const customer = await user_model.findOne({ _id: trip_by_id.created_by, });

        const companyData = await user_model.findOne({ _id: trip_by_id.created_by_company_id, });
        const company = await agency_model.findOne({ user_id: companyData._id });

        const superAdmin = await user_model.findOne({ role: "SUPER_ADMIN" });
        
        const adminCommision = await SETTING_MODEL.findOne({key: constant.ADMIN_SETTINGS.COMMISSION});

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
        const companyBalance = Number(companyData.totalBalance) + Number(commission) - Number(superAdminCommission);

        const updateCompanyWallet = await user_model.updateOne(
                                                                { _id: companyData._id },
                                                                { $set: { totalBalance: companyBalance } }
                                                              );

        const superBalance = Number(superAdmin.totalBalance) + Number(superAdminCommission);

        const updateSuperWallet = await user_model.updateOne(
                                                              { _id: superAdmin._id },
                                                              { $set: { totalBalance: superBalance } }
                                                            );

        return res.send({
                          result: trip_by_id,
                          code: constant.success_code,
                          message: res.__('successTripPay.success.paymentPaid'),
                          resultFromStipe,
                        });
      } else {
        
        trip_by_id.is_paid = false;
        trip_by_id.stripe_payment.payment_status = "Failed";
        await trip_by_id.save();

        return res.send({
                          result: trip_by_id,
                          code: constant.error_code,
                          message: res.__('successTripPay.error.notPaidYet'),
                        });
      }
    } catch (error) {
      throw error;
    }
  } catch (err) {

    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ success trip pay= ~ err:", err.message );

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
        message: res.__('payCompany.error.amountMustBePositive'),
      });

    const company = await user_model.findById(req.body.company_id);

    if (!company)
      return res.send({
        code: constant.error_code,
        message: res.__('payCompany.error.invalidCompany'),
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
        message: res.__('payCompany.error.amountExceedsBalance'),
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
      message: res.__('payCompany.success.commissionPaid'),
      transaction: newTransaction,
    });
  } catch (err) {
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ pay company= ~ err:", err.message );

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
      message: res.__('payCompany.success.commissionPaid'),
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
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ get commisiontransy= ~ err:", err.message );

    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};


exports.adminTransaction = async (req, res) => {
  try {

    let data = req.body;
    let dateQuery = await dateFilter(data );
    
    const totalAmountPurchasedPlan = await getTotalPurchasedSubscriptionAmount(dateQuery?.pickup_date_time);
    const paidTripCommisionOfAdmin = await getTotalPayment(dateQuery , {is_paid: true} , `superAdminPaymentAmount` , false);
    const DuesTripCommisionOfAdmin = await getTotalPayment(dateQuery , {is_paid: false} , `superAdminPaymentAmount` , false);
    
    // const commisionPaidToCompany = await getTotalPayment(dateQuery , {is_paid: true , is_company_paid: true } , `companyPaymentAmount` , false);
    const commisionPaidToCompany = await getTotalPayment(dateQuery , { is_company_paid: true } , `companyPaymentAmount` , false);
    const companyCommisionToBePaid = await getTotalPayment(dateQuery , { is_company_paid: false } , `companyPaymentAmount` , false);

    const dueCommisionFromDrivers = await getTotalPayment(dateQuery , { is_paid: false } , `driverPaymentAmount` , true);
    
    const recieveCommisionFromDrivers = await getTotalPayment(dateQuery , { is_paid: true} , `driverPaymentAmount` , true);

    // console.log('cgheckinf----------------')
    const driversNetEarning = await getTotalPayment(dateQuery , {} , `driverPaymentAmount` , false);
    
    
    // const countDriversWithPendingDues  = await TRIP.countDocuments({trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: false , ...dateQuery});
    // const countDriversWithPaidDues  = await TRIP.countDocuments({trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: true , ...dateQuery});

    const countDriversWithPendingDues  = await TRIP.distinct("driver_name" ,{trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: false , ...dateQuery});
    const countDriversWithPaidDues  = await TRIP.distinct("driver_name" ,{trip_status: constant.TRIP_STATUS.COMPLETED , is_paid: true , ...dateQuery});
    console.log('countDriversWithPaidDues---' , countDriversWithPaidDues)
    
    // const uniqueUnpaidTripDrivers = await TRIP.aggregate([
    //                                             {
    //                                               $match: {
    //                                                 trip_status: constant.TRIP_STATUS.COMPLETED,
    //                                                 is_paid: false,
    //                                                 ...dateQuery
    //                                               }
    //                                             },
    //                                             {
    //                                               $group: {
    //                                                 _id: "$driver_name" // group by driver to get unique drivers
    //                                               }
    //                                             }
    //                                           ]);


    // const countDriversWithPendingDues = uniqueUnpaidTripDrivers.length;
    // const unpaidDriverIds = uniqueUnpaidTripDrivers.map(d => d._id);

    // const uniquePaidTripDrivers = await TRIP.aggregate([
    //                                                 {
    //                                                   $match: {
    //                                                     trip_status: constant.TRIP_STATUS.COMPLETED,
    //                                                     is_paid: true,
    //                                                     driver_name: { $nin: unpaidDriverIds },
    //                                                     ...dateQuery
    //                                                   }
    //                                                 },
    //                                                 {
    //                                                   $group: {
    //                                                     _id: "$driver_name" // group by driver to get unique drivers
    //                                                   }
    //                                                 }
    //                                               ]);

    // const countDriversWithPaidDues = uniquePaidTripDrivers.length;

    res.send({
              code: constant.success_code,
              totalAmountPurchasedPlan,
              paidTripCommisionOfAdmin,
              DuesTripCommisionOfAdmin,
              commisionPaidToCompany,
              companyCommisionToBePaid,
              dueCommisionFromDrivers,
              recieveCommisionFromDrivers,
              countDriversWithPendingDues: countDriversWithPendingDues.length,
              countDriversWithPaidDues: countDriversWithPaidDues.length,
              driversNetEarning

            });

  } catch (err) {
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ admin transaction~ err:", err.message );
    res.send({
              code: constant.error_code,
              message: err.message,
            });
  }

}

exports.companyTransaction = async (req, res) => {
  try {

    let data = req.body;

    // Update the query based on the date filter
    let dateQuery = await dateFilter(data );
    // console.log('req.userId---' , req.userId);
    // for is_paid = true---- company will get the payment if driver paid or not afetr completed trip
    const totalCommisionFromCompletedTrips = await getTotalPayment(dateQuery , {created_by_company_id: new mongoose.Types.ObjectId(req.userId)} , `companyPaymentAmount` , false);
    const dueCommisionFromCompletedTrips = await getTotalPayment(dateQuery , { is_company_paid: false ,  created_by_company_id: new mongoose.Types.ObjectId(req.userId)} , `companyPaymentAmount` , false);
    const recieveCommisionsFromCompletedTrips = await getTotalPayment(dateQuery , { is_company_paid: true , created_by_company_id: new mongoose.Types.ObjectId(req.userId)} , `companyPaymentAmount` , false);
    
    const totalTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , is_deleted: false , ...dateQuery});
    const totalBookedTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , trip_status: constant.TRIP_STATUS.BOOKED ,  is_deleted: false , ...dateQuery});
    const totalPendingTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , trip_status: constant.TRIP_STATUS.PENDING , is_deleted: false ,  ...dateQuery});
    const totalActiveTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , trip_status: constant.TRIP_STATUS.ACTIVE ,  is_deleted: false , ...dateQuery});
    const totalCompletedTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , trip_status: constant.TRIP_STATUS.COMPLETED , is_deleted: false ,  ...dateQuery});
    const totalActivePickupTrips  = await TRIP.countDocuments({created_by_company_id: new mongoose.Types.ObjectId(req.userId) , trip_status: constant.TRIP_STATUS.REACHED ,  is_deleted: false , ...dateQuery});

    return res.send({
                      code: constant.success_code,
                      totalCommisionFromCompletedTrips,
                      dueCommisionFromCompletedTrips,
                      recieveCommisionsFromCompletedTrips,
                      totalTrips,
                      totalBookedTrips,
                      totalPendingTrips,
                      totalActiveTrips,
                      totalCompletedTrips,
                      totalActivePickupTrips
                    });

  } catch (err) {
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ compnay transcation= ~ err:", err.message );
    res.send({
              code: constant.error_code,
              message: err.message,
            });
  }

}

const getTotalPurchasedSubscriptionAmount = async (dateQuery = undefined) => {
  try {

    
    const totalAmount  = await SUBSCRIPTION_MODEL.aggregate([
                                                                {
                                                                    $match: { 
                                                                              paid: constant.SUBSCRIPTION_PAYMENT_STATUS.PAID ,
                                                                            ...(dateQuery && { createdAt: dateQuery })
                                                                          }
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
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ getTotalPurchasedSubscriptionAmount ~ err:", err.message );

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

  // console.log('🚀 ~matchCriteria------------', matchCriteria)
  if (revenueOnly) { // for drivers only where we will get recieved or pending commision from the drivers
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
    
  } else if (amountKey === 'driverPaymentAmount') { // for driver net earning
    groupStage = {
      $group: {
        _id: null,
        totalAmount: {
          $sum: {
            $add: [
              { $ifNull: ['$driverPaymentAmount', 0] },
              { $ifNull: ['$child_seat_price', 0] },
              { $ifNull: ['$payment_method_price', 0] }
            ]
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
                        message: res.__('adminUpdatePayment.error.tripAlreadyPaid'),
                      });
    } else {

    
      let criteria = { _id: tripId };
      let newValue = {}

      if (tripInfo?.is_paid) {

        newValue = {
                      $set: {
                        is_paid : false,
                        "stripe_payment.payment_status" : "Pending",
                        payment_completed_date : null,
                        payment_collcted : constant.PAYMENT_COLLECTION_TYPE.PENDING,
                        payment_updated_by_admin: null,
                        hosted_invoice_url: ``,
                        invoice_pdf: ``
                      },
                    };
      } else {
        newValue = {
                      $set: {
                        is_paid : true,
                        "stripe_payment.payment_status" : "Paid",
                        payment_completed_date : new Date(),
                        payment_collcted : constant.PAYMENT_COLLECTION_TYPE.MANUALLY,
                        payment_updated_by_admin: tripInfo?.is_paid ? null : req.userId,
                      },
                    };

        const driverDetail = await DRIVER_MODEL.findById(tripInfo?.driver_name);
        const stripeCustomerId = driverDetail?.stripeCustomerId;

        if (stripeCustomerId) {
          
          const isInvoiceForCompany  = false;
          const invoiceDetail = await generateInvoiceReceipt(stripeCustomerId , tripInfo , isInvoiceForCompany)
          
          newValue.$set.hosted_invoice_url  =     invoiceDetail?.hosted_invoice_url;   
          newValue.$set.invoice_pdf         =     invoiceDetail?.invoice_pdf;   

        }
      }
      
 
      let option = { new: true };
      let trip = await TRIP.findByIdAndUpdate(criteria, newValue, option);

      if (trip) {

        return res.send({
                          code: constant.success_code,
                          data: trip,
                          message: res.__('adminUpdatePayment.success.tripPaymentUpdated'),
                        });
      } else {
        return res.send({
                          code: constant.error_code,
                          message: err.message,
                        });
      }
    }
  } catch (err) {
    
    console.log( "❌❌❌❌❌❌❌❌❌🚀 ~ admin update ~ err:", err.message );

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
}
