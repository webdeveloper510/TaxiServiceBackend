const { default: mongoose } = require("mongoose");
const {
  initiateStripePayment,
  checkPaymentStatus,
} = require("../../Service/Stripe");
const constant = require("../../config/constant");
const agency_model = require("../../models/user/agency_model");
const transaction = require("../../models/user/transaction");
// const transaction = require("../../models/user/transaction");
const TRIP = require("../../models/user/trip_model");
const user_model = require("../../models/user/user_model");

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
    if(trip_by_id.is_paid){
      return res.send({
        code: constant.error_code,
        message:"Already paid"
       })
    }
    try {
      let commission = trip_by_id.commission.commission_value;
      console.log(
        "🚀 ~ file: paymentController.js:23 ~ exports.tripCommissionPayment= ~ commission:",
        commission
      );
      if (
        trip_by_id.commission.commission_type === "Percentage" &&
        trip_by_id.commission.commission_value > 0
      ) {
        commission =
          (trip_by_id.price * trip_by_id.commission.commission_value) / 100;
      }
      commission = commission.toFixed(2);
      console.log(
        "🚀 ~ file: paymentController`.js:23 ~ exports.tripCommissionPayment= ~ commission:",
        commission
      );
      const paymentResult = await initiateStripePayment(
        trip_by_id,
        parseInt(commission * 100)
      );
      res.send({
        code: constant.success_code,
        result: paymentResult,
        trip_by_id,
        message: "Success fully payment is created",
        // commission
      });
    } catch (error) {
      console.log(
        "🚀 ~ file: paymentController.js:34 ~ exports.tripCommissionPayment= ~ error:",
        error
      );
      res.send({
        code: constant.error_code,
        message: "Error while creating payment",
      });
    }
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
    if(trip_by_id.is_paid){
      return res.send({
        code: constant.error_code,
        message:"Already paid"
       })
    }
    // check from strip side is payment completed
    try {
      const resultFromStipe = await checkPaymentStatus(
        trip_by_id?.stripe_payment?.payment_intent_id
      );
     
      if (resultFromStipe.payment_status === "paid") {
        trip_by_id.is_paid = true;
        trip_by_id.stripe_payment.payment_status = "Paid";
        await trip_by_id.save();
        let commission = trip_by_id.commission.commission_value;
        if (
          trip_by_id.commission.commission_type === "Percentage" &&
          trip_by_id.commission.commission_value > 0
          ) {
            commission =
            (trip_by_id.price * trip_by_id.commission.commission_value) / 100;
          }
      const customer = await user_model.findOne({_id: trip_by_id.created_by});
      const companyData = await user_model.findOne({_id: customer.created_by});
      const company = await agency_model.findOne({user_id: companyData._id});
      console.log("🚀 ~ exports.successTripPay= ~ company:", company)
      const superAdmin = await user_model.findOne({role: 'SUPER_ADMIN'});
      const superAdminCommission = commission * parseFloat(company.commision) / 100 || 0;
     
      const companyTransaction =  new transaction({
          from: trip_by_id.driver_name,
          to: companyData._id,
          amount: commission - superAdminCommission,
          trip: trip_by_id._id,
          type: "credit"
        });
        await companyTransaction.save();
      const superTransaction = new transaction({
          from: trip_by_id.driver_name,
          to: superAdmin._id,
          amount: superAdminCommission,
          trip: trip_by_id._id,
          type: "credit"
        });
        await superTransaction.save();
        const companyBalance = companyData.totalBalance + commission - superAdminCommission;
        console.log("🚀 ~ exports.successTripPay= ~ companyBalance:", companyBalance)
      const updateCompanyWallet = await user_model.updateOne({_id: companyData._id},{$set:{totalBalance: companyBalance}}
      )
      console.log("🚀 ~ exports.successTripPay= ~ updateCompanyWallet:", updateCompanyWallet)
      const superBalance = superAdmin.totalBalance + superAdminCommission;
      console.log("🚀 ~ exports.successTripPay= ~ superBalance:", superBalance)
      const updateSuperWallet =await user_model.updateOne({_id: superAdmin._id},{$set:{totalBalance: superBalance}}
        )
      console.log("🚀 ~ exports.successTripPay= ~ updateSuperWallet:", updateSuperWallet)

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

exports.payCompany = async (req, res) => {
  try {
    
    console.log("🚀 ~ exports.payCompany= ~ req.role :", req.role, req.body.company_id )
    // if(req.role !== "SUPER_ADMIN")  return res.send({
    //   code: constant.error_code,
    //   message: "Your are not a SUPER ADMIN",
    // });
    const amount = parseFloat(req.body.amount);
    if(isNaN(amount) || !amount) return res.send({
      code: constant.error_code,
      message: "Amount must be a number and greater than zero",
    });

    const company = await user_model.findById(req.body.company_id);
    console.log("🚀 ~ exports.payCompany= ~ company:", company)
    if(!company) return res.send({
      code: constant.error_code,
      message: "Company not found",
    });
    const newTransaction = new  transaction({
      to: company._id,
      from: req.userId,
      amount: req.body.amount,
      fromType: "SUPER_ADMIN",
      type: "credit"
    })
    if(req.body.amount > company.totalBalance) return res.send({
      code: constant.error_code,
      message: "Amount should be less than total balance",
    });
    const updateCompany = user_model.updateOne({_id: company._id},{$set:{
      totalBalance: company.totalBalance - amount,
    }})
   
    const result = await Promise.all([newTransaction.save(),updateCompany]);
    res.send({
      code: constant.success_code,
      message: "You paid company commission successfully",
      transaction : newTransaction,
    })
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
    console.log("🚀 ~ exports.getCommissionTrans= ~ req.userId,:", req.userId,)
    const user = await user_model.findById(req.userId);
    const query = req.query.role == "SUPER_ADMIN" ? {
      from: new mongoose.Types.ObjectId(req.userId),
      fromType: "SUPER_ADMIN",
    }:{
      to: new mongoose.Types.ObjectId(req.userId),
      fromType: "SUPER_ADMIN",
    }
    const allSuperTrans =  transaction.aggregate([
      {
        $match:query
      },
      {
        $sort: {
          createdAt: -1
        }
      },
      {
        $lookup:{
          from: "users",
          localField: "to",
          foreignField: "_id",
          as: "company",
        }
      },
      {
        $unwind:
          {
            path: "$company",
          }
      },
      {
        $lookup:{
          from: "agencies",
          localField: "company._id",
          foreignField: "user_id",
          as: "companyData",
        }
      },
      {
        $unwind:
          {
            path: "$companyData",
          }
      },
    ])
    const allDriverTrans =  transaction.find({
      to: req.userId,
      fromType: "DRIVER",
    }).populate("trip").populate("from").sort({
      createdAt: -1
    })
    const getTotalAmount = async(start)=>{
      const amount = await transaction.aggregate([
        {
          $match:{
            to: new mongoose.Types.ObjectId(req.userId),
            fromType: "DRIVER",
          }
        },
        {
          $group:{
            _id: null,
            totalEarnings: {
              $sum: "$amount"
            } 
          }
        }
      ])
      return amount[0]?.totalEarnings || 0;
    }

    const result = await Promise.all([allSuperTrans, allDriverTrans]);
    const date = new Date()
    res.send({
      code: constant.success_code,
      message: "You paid company commission successfully",
      allSuperTrans : result[0],
      allDriverTrans : result[1],
      totalBalance : user.totalBalance,
      totalEarning: await getTotalAmount( new Date(1,1,1).setHours(0, 0, 0, 0)),
      totalEarningLastSevenDays: await getTotalAmount( new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).setHours(0, 0, 0, 0)),
      totalEarningFromMonth: await getTotalAmount(new Date(date.getFullYear(), date.getMonth(), 1).setHours(0, 0, 0, 0)),
      totalEarningFromYear: await getTotalAmount(new Date(date.getFullYear(),1, 1).setHours(0, 0, 0, 0)),
    })
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


