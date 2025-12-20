const cron = require("node-cron");
const DRIVER_MODEL = require("../models/user/driver_model");
const CONSTANT = require('../config/constant')

exports.processDriverDocumentExpiryAlerts = (io) =>  {
  cron.schedule("* * * * *", async () => { // every minute

   try {
    // await findExpiringDriverDocuments(io , 10);
      // await addKycToOldDriver();
    //   await checkDriverDocumentExpirations()
    } catch (cronErr) {
      console.error("❌ driver auto logout Cron Crash Prevented:", cronErr);
    }
  });
}

// ✅ Build exact UTC range for the target day (today + daysBefore)
const getUtcDayRangeNDaysFromNow = async (daysAhead) => {
  const n = Number(daysAhead);

  if (!Number.isFinite(n)) {
    return { start: null, end: null };
  }

  const now = new Date();

  const start = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + n,
    0, 0, 0, 0
  ));
console.log("nnnnnnnnnn-------" , n , start)
  const end = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + n,
    23, 59, 59, 999
  ));
  console.log({ start, end })
  return { start, end };
}

const safeIso = async (d) => {
  return d instanceof Date && !isNaN(d.getTime()) ? d.toISOString() : "INVALID_DATE";
}

const safeDateOnly = async (d) => {
  const dt = d instanceof Date ? d : new Date(d);
  return dt instanceof Date && !isNaN(dt.getTime())
    ? dt.toISOString().slice(0, 10)
    : "";
}

const documentLabel = (type) => {
  switch (type) {
    case CONSTANT.DRIVER_DOC_TYPE.KVK_KIWA:
      return "Kiwa / Business Registration document";
    case CONSTANT.DRIVER_DOC_TYPE.CHAUFFEUR_CARD:
      return "Chauffeur Card";
    case CONSTANT.DRIVER_DOC_TYPE.DRIVER_LICENSE:
      return "Driver License";
    case CONSTANT.DRIVER_DOC_TYPE.PROFILE_PHOTO:
      return "Profile Photo";
    default:
      return type;
  }
}

// ✅ replace this with your real sendgrid function
const sendDriverExpiryEmail = async ({ to, name, docName, expiryDateISO, daysBefore }) => {
  // Example: integrate your existing SendGrid util
  // await sendGrid.send({ to, from, subject, html })
  console.log(`[EMAIL] To=${to} | ${docName} expires on ${expiryDateISO} | ${daysBefore} days before`);
  return { provider: "SENDGRID", messageId: "" }; // optionally return msg id
}

const checkDriverDocumentExpirations = async () => {
  try {

    console.log("checkDriverDocumentExpirations-----------------------")
    const daysList = CONSTANT.DRIVER_DOCUMENT_EXPIRY_REMINDER_DAYS_LIST || [30, 15, 5];

    // Optional expiry: skip profile photo reminders
    const excludedTypes = [CONSTANT.DRIVER_DOC_TYPE.PROFILE_PHOTO];

    for (const daysBefore of daysList) {
      const { start, end } = getUtcDayRangeNDaysFromNow(daysBefore);

      // ✅ Guard: prevents toISOString crash
      if (!start || !end) {
        console.log(`[CRON] Skipping invalid daysBefore:`, daysBefore , { start, end });
        continue;
      }
      console.log(`[CRON] Expiry reminders (${daysBefore}d) window: ${safeIso(start)} - ${safeIso(end)}`);



      // Find docs expiring on that target day AND not already reminded for that daysBefore+EMAIL
      const rows = await DRIVER_MODEL.aggregate([
        { $match: { is_deleted: false } },
        { $unwind: "$kyc.documents" },
        {
          $match: {
            "kyc.documents.status": CONSTANT.DOC_STATUS.APPROVED,
            "kyc.documents.type": { $nin: excludedTypes },
            "kyc.documents.expirationDate": { $ne: null, $gte: start, $lte: end },

            // prevent duplicates: no reminder exists for this daysBefore on EMAIL
            $or: [
              { "kyc.documents.expiryReminders": { $exists: false } },
              {
                "kyc.documents.expiryReminders": {
                  $not: {
                    $elemMatch: { daysBefore, channel: "EMAIL", status: "SENT" }
                  }
                }
              }
            ]
          }
        },
        {
          $project: {
            driverId: "$_id",
            email: 1,
            first_name: 1,
            last_name: 1,
            docType: "$kyc.documents.type",
            expirationDate: "$kyc.documents.expirationDate",
          }
        }
      ]);

      if (!rows.length) {
        console.log(`[CRON] No docs found for ${daysBefore} days reminder.`);
        continue;
      }

      console.log(`[CRON] Found ${rows.length} docs for ${daysBefore} days reminder.`);

      for (const r of rows) {
        // If driver email missing, skip safely
        if (!r.email) continue;

        const name = `${r.first_name || ""} ${r.last_name || ""}`.trim() || "Driver";
        const docName = documentLabel(r.docType);

        let provider = "";
        let messageId = "";
        let status = "SENT";
        let failReason = "";

        try {
          const resp = await sendDriverExpiryEmail({
            to: r.email,
            name,
            docName,
            expiryDateISO: new Date(r.expirationDate).toISOString().slice(0, 10),
            daysBefore,
          });

          provider = resp?.provider || "SENDGRID";
          messageId = resp?.messageId || "";
        } catch (e) {
          status = "FAILED";
          failReason = e?.message || "Email send failed";
        }

        const reminderEntry = {
          daysBefore,
          channel: "EMAIL",
          sentAt: new Date(),
          provider,
          messageId,
          status,
          failReason,
        };

        // Store reminder event in the SAME document entry
        await DRIVER_MODEL.updateOne(
          { _id: r.driverId, "kyc.documents.type": r.docType },
          {
            $push: { "kyc.documents.$.expiryReminders": reminderEntry },
            $set: {
              "kyc.documents.$.lastExpiryReminderAt": reminderEntry.sentAt,
              "kyc.documents.$.lastExpiryReminderDaysBefore": daysBefore,
            },
          }
        );

        console.log(`[CRON] ${status} reminder: driver=${r.driverId} doc=${r.docType} daysBefore=${daysBefore}`);
      }
    }

    console.log("[CRON] checkDriverDocumentExpirations done");
  } catch (err) {
    console.error("❌ [CRON] checkDriverDocumentExpirations failed:", err.message);
  }
}