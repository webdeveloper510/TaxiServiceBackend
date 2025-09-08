require("dotenv").config();
const TRIP_MODEL = require("../models/user/trip_model.js");
const USER_MODEL = require("../models/user/user_model");
const CONSTANT = require("../config/constant.js");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
// const { generateInvoiceReceipt } = require("./helperFuntion");

exports.generateCompanyInvoices = async () => {

    // Company invoice will be generate  after 10 days when payout will be paid to the bank
    const tripList = await this.getTripsForInvoices()

    if (!tripList.length) {
        console.log('No eligible trips for invoice.----' , new Date());
        return;
    }

    for (let trip of tripList) {

        let stripeCustomerId = trip?.companyDetails?.stripeCustomerId;
        const invoiceDetail = await this.generateInvoiceReceipt(stripeCustomerId , trip);
        
        await TRIP_MODEL.findOneAndUpdate(
                                            { _id: trip?._id }, // Find by tripId
                                            { 
                                            $set: {  
                                                    company_hosted_invoice_url : invoiceDetail?.hosted_invoice_url,
                                                    company_invoice_pdf : invoiceDetail?.invoice_pdf
                                                    } 
                                            }, 
                                            { new: true } // Return the updated document
                                        );
    }

    return tripList
}

exports.getTripsForInvoices = async () => {

    // Company invoice will be generate  after 10 days when payout will be paid to the bank
    const TEN_DAYS_AGO = new Date();
    TEN_DAYS_AGO.setDate(TEN_DAYS_AGO.getDate() - 10); // 10 adys ago
    
    let tripList  = await TRIP_MODEL.aggregate([
                                                {
                                                    $match: { 
                                                                is_company_paid: true,
                                                                trip_status: CONSTANT.TRIP_STATUS.COMPLETED,
                                                                company_trip_payout_status: CONSTANT.PAYOUT_TANSFER_STATUS.PAID,
                                                                company_hosted_invoice_url: "",
                                                                company_invoice_pdf: "",
                                                                "payout.completed_date": { $lte: TEN_DAYS_AGO }
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
                                                        },
                                                        // Lookup agency collection where agency.user_id = user._id
                                                        {
                                                            $lookup: {
                                                                from: "agencies",
                                                                let: { userId: "$_id" },
                                                                pipeline: [
                                                                { $match: { $expr: { $eq: ["$user_id", "$$userId"] } } }
                                                                ],
                                                                as: "agencyDetails"
                                                            }
                                                        },
                                                        { $unwind: { path: "$agencyDetails", preserveNullAndEmptyArrays: true } }
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
                                                        "companyDetails.agencyDetails.company_name": 1
                                                    }
                                                }
                                            ]);

    return tripList;
}

exports.generateInvoiceReceipt = async (stripeCustomerId , tripDetail) => {

    const externalAccounts = await stripe.accounts.listExternalAccounts(
                                                                            tripDetail?.companyDetails?.connectedAccountId,
                                                                            { object: 'bank_account' }
                                                                        );
    const bank = externalAccounts.data[0] || {};
      
    const companyName = bank?.account_holder_name || tripDetail?.companyDetails?.agencyDetails?.company_name || 'Company Name';
    
    // 1. Create the invoice
    const invoice = await stripe.invoices.create({
                                                    customer: stripeCustomerId,
                                                    collection_method: 'send_invoice',
                                                    days_until_due: 0,
                                                    custom_fields: [
                                                    { name: 'Bank', value: bank?.bank_name },
                                                    { name: 'Account Holder', value: companyName },
                                                    { name: 'Account Number', value: `****${bank?.last4}` },
                                                    { name: 'Currency', value: bank?.currency?.toUpperCase() }
                                                    ],
                                                    footer: 'Thanks for your business.',
                                                });
    
    let amount = tripDetail?.companyPaymentAmount.toFixed(0); 

    await stripe.invoiceItems.create({
                                        customer: stripeCustomerId,
                                        invoice: invoice.id, // 🔥 attach this item to the specific invoice
                                        amount: Number(amount) * 100, // €100.00
                                        currency: bank?.currency,
                                        description: `${tripDetail?.trip_id}`,
                                        tax_rates: [process.env.STRIPE_VAT_TAX_ID],
                                    });

    const finalizedInvoice = await stripe.invoices.finalizeInvoice(invoice.id);
    // 5. Mark it as paid (only works for invoices not paid via Stripe directly)

    let  invoiceDetail = await stripe.invoices.retrieve(invoice.id);

    if (invoiceDetail.status !== 'paid') {

        const paidInvoice = await stripe.invoices.pay(invoice.id, { paid_out_of_band: true, });
    }
    
    invoiceDetail = await stripe.invoices.retrieve(invoice.id);
    
    return invoiceDetail
}