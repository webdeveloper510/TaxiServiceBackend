const trip_model = require("../../models/user/trip_model");
///
const stripe = require("stripe")("sk_test_Vg8WAFbiq48h1IoZVb1WnNSj");

exports.initiateStripePayment = async (trip, amount) => {
  try {
    const paymentIntent = await stripe.checkout.sessions.create({
      payment_method_types: ["ideal"],
      line_items: [
        {
          price_data: {
            currency: "eur",
            product_data: {
              name: "Trip Commission " + trip.trip_id,
            },
            unit_amount: amount,
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/${trip._id}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel/${trip._id}`,
    });

    console.log("first step+++++++++++++++++++++", paymentIntent);

    // Update the Trip model with the Payment Intent ID
    // const tripUpdateData = await trip_model.findOne(
    //     { trip_id: tripId },
    //     {
    //         $set: {
    //             'stripe_payment.payment_intent_id': paymentIntent.id,
    //             'stripe_payment.payment_status': 'Pending',
    //         },
    //     },
    //     { new: true }
    // );
    const tripUpdate = await trip_model.updateOne(
      {
        _id: trip._id,
      },
      {
        $set: {
          "stripe_payment.payment_intent_id": paymentIntent.id,
          "stripe_payment.payment_status": "Pending",
        },
      }
    );
    return paymentIntent;
  } catch (error) {
    console.error("Error initiating payment:", error);
    throw error;
  }
};

exports.checkPaymentStatus = async (paymentIntentId) => {
  try {
    // Retrieve the payment intent from Stripe using the paymentIntentId
    const paymentIntent = await stripe.checkout.sessions.retrieve(paymentIntentId);
    return paymentIntent

    // // Check the status of the payment intent
    // const paymentStatus = paymentIntent.status;

    // // You can customize this logic based on your requirements
    // if (paymentStatus === 'succeeded') {
    //   // Payment is completed
    //   return { success: true, message: 'Payment completed successfully' };
    // } else if (paymentStatus === 'requires_payment_method') {
    //   // Payment requires a valid payment method
    //   return { success: false, message: 'Payment requires a valid payment method' };
    // } else {
    //   // Handle other payment statuses if needed
    //   return { success: false, message: 'Payment not completed', status: paymentStatus };
    // }
  } catch (error) {
    throw error;
  }
};
