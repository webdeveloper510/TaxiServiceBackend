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
      success_url: `http://localhost:3000/payment/success/${trip._id}`,
      cancel_url: `http://localhost:3000/payment/cancel/${trip._id}`,
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
