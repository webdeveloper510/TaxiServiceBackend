const cron = require("node-cron");
const DRIVER_MODEL = require("../models/user/driver_model");
const CONSTANT = require('../config/constant');
const { driverDocumentExpirationEmail } = require("../Service/helperFuntion");
const { humanize } = require("../utils/fileUtils");

exports.driverDocumentExpiry = (io) =>  {
  cron.schedule("* * * * *", async () => { // every minute

   try {
    
    console.log("documet expired---")
      await checkDriverDocumentExpirated()
    } catch (cronErr) {
      console.error("❌ driver auto logout Cron Crash Prevented:", cronErr);
    }
  });
}

const checkDriverDocumentExpirated = async () => {

    try {

        const now = new Date(); // UTC time
        console.log("[CRON] Expiry email job started:", now.toISOString());

        const expiredDocs = await DRIVER_MODEL.aggregate([
                                                            {
                                                                $match: {
                                                                "kyc.documents": {
                                                                    $elemMatch: {
                                                                    expirationDate: { $lt: now },
                                                                    status: { $ne: CONSTANT.DOC_STATUS.EXPIRED },
                                                                    $or: [
                                                                        { emailSentOnExpiry: { $exists: false } },
                                                                        { emailSentOnExpiry: false },
                                                                    ],
                                                                    },
                                                                },
                                                                },
                                                            },
                                                            { $unwind: "$kyc.documents" },
                                                            {
                                                                $match: {
                                                                "kyc.documents.expirationDate": { $lt: now },
                                                                "kyc.documents.status": { $ne: CONSTANT.DOC_STATUS.EXPIRED },
                                                                $or: [
                                                                    { "kyc.documents.emailSentOnExpiry": { $exists: false } },
                                                                    { "kyc.documents.emailSentOnExpiry": false },
                                                                ],
                                                                },
                                                            },
                                                            {
                                                                $project: {
                                                                _id: 1,
                                                                email: 1,
                                                                first_name: 1,
                                                                last_name: 1,
                                                                docType: "$kyc.documents.type",
                                                                expirationDate: "$kyc.documents.expirationDate",
                                                                },
                                                            },
                                                        ]);

        console.log("expiredDocs----------" , expiredDocs);

        for (const item of expiredDocs) {
            const lock = await DRIVER_MODEL.updateOne(
                                                        { _id: item._id },
                                                        {
                                                            $set: {
                                                                    "kyc.verification.status": CONSTANT.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW,
                                                                    "kyc.verification.isVerified": false,
                                                                    "kyc.documents.$[doc].emailSentOnExpiry": true,
                                                                    "kyc.documents.$[doc].expiredAt": now,
                                                                    "kyc.documents.$[doc].status": CONSTANT.DOC_STATUS.EXPIRED,
                                                                },
                                                        },
                                                        {
                                                            arrayFilters: [
                                                            {
                                                                $and: [
                                                                { "doc.type": item.docType },
                                                                { "doc.expirationDate": { $lt: now } },
                                                                { "doc.status": { $ne: CONSTANT.DOC_STATUS.EXPIRED } },
                                                                {
                                                                    $or: [
                                                                    { "doc.emailSentOnExpiry": { $exists: false } },
                                                                    { "doc.emailSentOnExpiry": false },
                                                                    ],
                                                                },
                                                                ],
                                                            },
                                                            ],
                                                        }
                                                    );


            if (lock.modifiedCount === 1) {
                driverDocumentExpirationEmail(item , new Date(item.expirationDate).toISOString().slice(0, 10) , humanize(item.docType) , item.docType);
            }
        }

    } catch (cronErr) {
      console.error("❌  checkDriverDocumentExpirated Cron Crash Prevented:", cronErr);
    }
    
}