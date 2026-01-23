const constant = require("../../config/constant");
const DRIVER = require("../../models/user/driver_model"); // Import the Driver model
const AGENCY = require("../../models/user/agency_model");
const USER = require("../../models/user/user_model"); // Import the Driver model
const RATING_MODEL = require("../../models/user/trip_rating_model"); // Import the Rating model
const TRIP = require("../../models/user/trip_model"); // Import the Driver model
const bcrypt = require("bcrypt");
const multer = require("multer");
const randToken = require("rand-token").generator();
const path = require("path");
const jwt = require("jsonwebtoken");
const mongoose = require("mongoose");
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const { getDriverNextSequenceValue } = require("../../models/user/driver_counter_model");
const { getUserActivePaidPlans , getDriverTripsRanked } = require("../../Service/helperFuntion");
const  { isEmpty, toStr ,  groupFilesByField ,  fileUrl , ensureDocEntry , humanize} = require("../../utils/fileUtils");
// var driverStorage = multer.diskStorage({
//     destination: function (req, file, cb) {
//         cb(null, path.join(__dirname, '../../uploads/driver'))
//
//     },
//     filename: function (req, file, cb) {
//
//         cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname))
//     }
// })

// var driverUpload = multer({
//     storage: driverStorage
// }).single("driver_image")

const { CloudinaryStorage } = require("multer-storage-cloudinary");
const cloudinary = require("../../config/cloudinary");
const { get } = require("../../routes/admin");
const trip_model = require("../../models/user/trip_model");
const imageStorage = require("../../config/awss3");

// const imageStorage = new CloudinaryStorage({
//     cloudinary: cloudinary,
//     params: {
//         folder: "TaxiBooking",
//         // allowedFormats: ["jpg", "jpeg", "png"],
//         public_id: (req, file) =>
//             `${Date.now()}-${Math.round(Math.random() * 1e9)}`,
//         // format: async (req, file) => "jpg", // Convert all uploaded images to JPEG format
//         // transformation: [{ width: 500, height: 500, crop: "limit" }],
//         maxFileSize: 10000000,
//     },
// });

const driverDocumentsUpload = multer({ storage: imageStorage, limits: { fileSize: 100 * 1024 * 1024 }, }).any();

var driverUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 100 * 1024 * 1024 },
}).single("driver_image");

exports.add_driver = async (req, res) => {
  driverUpload(req, res, async (err) => {
    try {
      const data = req.body;

      let hash = await bcrypt.hashSync(
        data.password ? data.password : "Test@123",
        10
      );
      data.password = hash;
      data.created_by = req.userId; // Assuming you have user authentication
      data.agency_user_id = req.userId; // Assuming you have user authentication
      data.profile_image = req.file
        ? req.file.path
        : "https://res.cloudinary.com/dtkn5djt5/image/upload/v1697718254/samples/y7hq8ch6q3t7njvepqka.jpg";

      let save_driver = await DRIVER(data).save();
      if (!save_driver) {
        res.send({
          code: constant.error_code,
          message: res.__("addDriver.error.saveFailed"),
        });
      } else {
        res.send({
          code: constant.success_code,
          message: res.__("addDriver.success.driverCreated"),
          result: save_driver,
        });
      }
    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error add driver:', err.message);
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }
  });
};

exports.remove_driver = async (req, res) => {
  try {
    const driverId = req.params.id; // Assuming you pass the driver ID as a URL parameter

    // You may want to add additional checks to ensure the driver exists or belongs to the agency user
    const removedDriver = await DRIVER.findById(driverId);

    if (removedDriver) {
      removedDriver.is_deleted = true;
      removedDriver.save();
      res.send({
        code: constant.success_code,
        message: res.__("deleteDriver.success.driverDeleted"),
        result: removedDriver,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__("getDrivers.error.noDriverFound"),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error remove driver:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_driver_detail = async (req, res) => {
  try {
    const driverId = req.params.id ?? req.userId; // Assuming you pass the driver ID as a URL parameter

    const driver = await DRIVER.findOne({
                                          _id: req.userId,
                                          is_deleted: false,
                                        });
    if (!driver) {
      res.send({
        code: constant.error_code,
        message: res.__("getDriverDetail.error.unableToFetchDriverDetails"),
      });
    } else {
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      // const completedTrips = await trip_model.countDocuments({
      //                                               driver_name: req.userId,
      //                                               trip_status: "Completed",
      //                                               is_paid: true,
      //                                             });

      // const totalActiveTrips = await trip_model.countDocuments({
      //                                                 driver_name: req.userId,
      //                                                 trip_status: "Active",
      //                                               });

      // const totalUnpaidTrips = await trip_model.countDocuments({
      //                                                 driver_name: req.userId,
      //                                                 trip_status: "Completed",
      //                                                 is_paid: false,
      //                                                 drop_time: {
      //                                                   $lte: startOfCurrentWeek,
      //                                                 },
      //                                               });

      // const totalReachedTrip = await trip_model.countDocuments({
      //                                                 driver_name: req.userId,
      //                                                 trip_status: "Reached",
      //                                                 is_paid: false,
      //                                               });

      
      const [
                completedTrips,
                totalActiveTrips,
                totalUnpaidTrips,
                totalReachedTrip
              ] = await Promise.all([
                trip_model.countDocuments({ driver_name: driverId, trip_status: "Completed", is_paid: true }),
                trip_model.countDocuments({ driver_name: driverId, trip_status: "Active" }),
                trip_model.countDocuments({ driver_name: driverId, trip_status: "Completed", is_paid: false, drop_time: { $lte: startOfCurrentWeek } }),
                trip_model.countDocuments({ driver_name: driverId, trip_status: "Reached", is_paid: false }),
              ]);

      const result = driver.toObject();

      const companyDetailPromise = result.driver_company_id ? USER.findById(result.driver_company_id) : null;
      
      const partnerCompanyIds  = [];
      const accessList = result.parnter_account_access || [];

      for (let i = 0; i < accessList.length; i++) {
        const companyId = accessList[i]?.company_id;
        if (companyId) {
          partnerCompanyIds .push(new mongoose.Types.ObjectId(companyId));
        }
      }

      // const partnerCompanyAccess = await result.parnter_account_access.map((data) =>  new mongoose.Types.ObjectId(data?.company_id?.toString()));
      
      // result.partnerCompanyAccess =  partnerCompanyIds  ? await AGENCY.find({user_id: { $in: partnerCompanyIds  }}) : []
      const partnerCompaniesPromise = partnerCompanyIds.length ? AGENCY.find({ user_id: { $in: partnerCompanyIds } }) : Promise.resolve([]);
      
      const driverPurchasedPlansPromise  =  getUserActivePaidPlans(req.user);

       const [companyDetail, partnerCompanies, driverPurchasedPlans] = await Promise.all([
                                                                                            companyDetailPromise,
                                                                                            partnerCompaniesPromise,
                                                                                            driverPurchasedPlansPromise
                                                                                          ]);

      if (companyDetail) result.companyDetail = companyDetail;
      result.partnerCompanyAccess = partnerCompanies;
      result.plan_access_status = driverPurchasedPlans.length > 0 ? true : false;
      result.totalTrips = completedTrips;

      return res.send({
                      code: constant.success_code,
                      message: res.__("getDriverDetail.success.driverDetailsFetched"),
                      partner_access: partnerCompanyIds,
                      result,
                      totalActiveTrips,
                      totalUnpaidTrips,
                      totalReachedTrip,
                    });
    }
    // if (driver && driver.is_deleted === false) {
    //     res.send({
    //         code: constant.success_code,
    //         message: 'Driver deleted successfully',
    //         result: driver,
    //     })
    // } else {
    //     res.send({
    //         code: constant.error_code,
    //         message: 'Driver not found',
    //     });
    // }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get driver details:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_drivers = async (req, res) => {
  try {
    const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request

    const drivers = await DRIVER.find({ is_deleted: false }).sort({
      createdAt: -1,
    });

    if (drivers) {
      res.send({
        code: constant.success_code,
        message: res.__("getDrivers.success.driverListRetrieved"),
        result: drivers,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__("getDrivers.error.noDriverFoundForAgency"),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get drivers:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.update_driver = async (req, res) => {
  driverUpload(req, res, async (err) => {
    try {
      const driverId = req.userId; // Assuming you pass the driver ID as a URL parameter
      const updates = req.body; // Assuming you send the updated driver data in the request body

      // Check if the driver exists
      const existingDriver = await DRIVER.findOne({ _id: driverId });

      if (!existingDriver || existingDriver.is_deleted) {
        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.driverNotFound'),
                        });
      }

      const isDriverOnRide = await TRIP.findOne({driver_name: driverId , trip_status: { $in: [ constant.TRIP_STATUS.REACHED , constant.TRIP_STATUS.ACTIVE] } });

      // If driver is on ride then he cant be  offline
      if (isDriverOnRide && updates?.status == "false") {

        return res.send({
                          code: constant.error_code,
                          message: res.__('updateDriver.error.cannotGoOfflineWithActiveTrip')
                        });
      }

      updates.profile_image = req.file ? req.file.filename : existingDriver.profile_image;

      const updatedDriver = await DRIVER.findOneAndUpdate( { _id: driverId }, updates, { new: true } );

      if (updatedDriver) {
        return res.send({
                          code: constant.success_code,
                          message: res.__('updateDriver.success.driverAccountUpdated'),
                          result: updatedDriver,
                        });
      }
    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error update drivers:', err.message);
      return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
    }
  });
};


exports.uploadSignupDocuments = async (req, res) => {
console.log("✅ HIT uploadSignupDocuments", req.method, req.originalUrl);
  driverDocumentsUpload(req, res, async (err) => {

    try {
      // console.log("Files uploaded:", req.files);
      console.log("✅ MULTER CALLBACK REACHED"); // tells you multer finished parsing
      if (err) {
        console.log("❌ Multer error driverDocumentsUpload:", err);
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.uploadFailed"),
                      });
      }

      // console.log("✅ BODY KEYS:", Object.keys(req.body || {}));
      const driverId = req.params.id;
      
      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("updateDriver.error.driverNotFound"),
                        });
      }

      const driver = await DRIVER.findOne({ _id: driverId, is_deleted: false }, { "kyc.documents": 1  , "kyc.verification": 1}).lean();
      if (!driver) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.driverNotFound"),
        });
      }

      if (driver.kyc?.verification?.status === constant.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW) {

        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.driverDocumentsAlready_under_review"),
        });
      }

      // 3) Group files + Strictly allow only expected file fields
      const filesByField = groupFilesByField(req.files || []);
      const uploadedFieldNames = Object.keys(filesByField);
      const invalidFields = uploadedFieldNames.filter(
        (f) => !Object.keys(constant.DRIVER_DOC_TYPE).includes(f)
      );

      
      if (invalidFields.length > 0) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.invalidFileField"),
                        invalidFields
                      });
      }

      // 4) Validate required documents exist
      const missingDocs = Object.keys(constant.DRIVER_DOC_TYPE).filter(
        (f) => !filesByField[f] || filesByField[f].length === 0
      );

      if (missingDocs.length > 0) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.missingDocuments"),
                        missingDocuments: missingDocs,
                      });
      }

    const { address_1, address_2,  country, city, zip_code, companyName, kvk, VatNumber,  bankNumber,} = req.body;

      const missingText = [];
      if (isEmpty(address_1)) missingText.push("address_1");
      if (isEmpty(country)) missingText.push("country");
      if (isEmpty(city)) missingText.push("city");
      if (isEmpty(zip_code)) missingText.push("zip_code");
      if (isEmpty(companyName)) missingText.push("companyName");
      if (isEmpty(kvk)) missingText.push("kvk");
      if (isEmpty(VatNumber)) missingText.push("VatNumber");
      if (isEmpty(bankNumber)) missingText.push("bankNumber");

      if (missingText.length > 0) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.missingFields"),
          missingFields: missingText,
        });
      }

      const docs = Array.isArray(driver?.kyc?.documents)
        ? JSON.parse(JSON.stringify(driver.kyc.documents)) // safe clone
        : [];

      const now = new Date();

      // ensure all doc types exist
      for (const field of Object.values(constant.DRIVER_DOC_TYPE)) {
        ensureDocEntry(docs, constant.DRIVER_DOC_TYPE[field]);
      }

      // fill each doc
      for (const field of Object.values(constant.DRIVER_DOC_TYPE)) {
        const type = constant.DRIVER_DOC_TYPE[field];
        const uploadedFiles = filesByField[field];

        const urls = uploadedFiles.map((f) => f.location || f.path).filter(Boolean);
        const mimes = uploadedFiles.map((f) => f.mimetype).filter(Boolean);

        const doc = docs.find((d) => d.type === type);

        doc.files = urls;
        doc.mimeTypes = mimes;
        doc.status = constant.DOC_STATUS.PENDING;
        doc.submittedAt = now;

        doc.reviewedAt = null;
        doc.reviewedBy = null;
        doc.rejectReasonKey = "";
        doc.rejectReasonText = "";

        // first upload reset
        doc.revision = doc.revision || 0;
        doc.versions = doc.versions || [];
      }

      let updateData = {
        address_1 : toStr(address_1),
        address_2 : isEmpty(address_2) ? "" : toStr(address_2),
        country : toStr(country),
        city : toStr(city),
        zip_code : toStr(zip_code),
        companyName : toStr(companyName),
        kvk : toStr(kvk),
        VatNumber : toStr(VatNumber),
        bankNumber : toStr(bankNumber),
        isDocUploaded: true,
        "kyc.documents": docs,
        "kyc.verification.status": constant.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW,
        "kyc.verification.isVerified": false,
        "kyc.verification.lastSubmittedAt": now,
        "kyc.canGoOnline": false,
      }

      const updated = await DRIVER.findOneAndUpdate(
        { _id: driverId, is_deleted: false },
        { $set: updateData },
        { new: true }
      ).lean();

    return res.send({
                      code: constant.success_code,
                      message: res.__("updateDriver.success.driverDocumentsUnderReview")
                    });
    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error get uploadSignupDocuments:', err.message);
      res.send({
        code: constant.error_code,
        message: err.message,
      });
    }    
  });
  
}

exports.resubmitRejectedDocuments = async (req, res) => {

  driverDocumentsUpload(req, res, async (err) => {

    try {

      console.log("✅ MULTER CALLBACK REACHED"); // tells you multer finished parsing
      if (err) {
        console.log("❌ Multer error driverDocumentsUpload:", err);
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.uploadFailed"),
                      });
      }

      const driverId = req.params.driverId;

      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("updateDriver.error.driverNotFound")
                        });
      }

      const driver = await DRIVER.findOne({ _id: driverId, is_deleted: false }, { "kyc.documents": 1  , "kyc.verification": 1}).lean();
      if (!driver) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.driverNotFound"),
        });
      }

      // 3) Group files + Strictly allow only expected file fields
      const filesByField = groupFilesByField(req.files || []);
      const uploadedFields = Object.keys(filesByField);


      // Must upload at least 1 file
      if (uploadedFields.length === 0) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.noFilesUploaded"),
        });
      }

      // Reject unknown fields
      const invalidFields = uploadedFields.filter(
        (f) => !Object.keys(constant.DRIVER_DOC_TYPE).includes(f)
      );

      if (invalidFields.length > 0) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.invalidFileField"),
                        invalidFields
                      });
      }

      const docs = driver?.kyc?.documents || [];
      const docByType = new Map(docs.map((d) => [d.type, d]))
      // Validate: only allow re-upload for REJECTED docs
      const rejectedTypesToUpload = [];

      for (const field of uploadedFields) {

        const type = field;
        const existingDoc = docByType.get(type);

        if (!existingDoc) {

          
          return res.send({
                            code: constant.error_code,
                            message: res.__("updateDriver.error.documentMissingInProfile"),
                          });
        }
       

        if (existingDoc.status == constant.DOC_STATUS.PENDING ) {
          // If approved or pending or not_uploaded, block re-upload in this endpoint
          return res.send({
                            code: constant.error_code,
                            message: res.__("updateDriver.error.documentAlreadyInReview" , {documentName: humanize(type)}),
                          });
        }

        if (existingDoc.status == constant.DOC_STATUS.APPROVED ) {
          // If approved or pending or not_uploaded, block re-upload in this endpoint
          return res.send({
                            code: constant.error_code,
                            message: res.__("updateDriver.error.onlyRejectedCanResubmit"),
                            type: type
                          });
        }

        rejectedTypesToUpload.push(type);
      }

      const now = new Date();

      for (const field of uploadedFields) {

        const type = field;
        const existingDoc = docByType.get(type);

        const uploadedFiles = filesByField[field] || [];

        const urls = uploadedFiles.map((f) => f.location || f.path).filter(Boolean);
        const mimes = uploadedFiles.map((f) => f.mimetype).filter(Boolean);

        if (urls.length === 0) {
           return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.uploadFailed"),
                        field
                      });
        }

        const nextRevision = (existingDoc.revision || 0) + 1;

        // build history version (store OLD rejected state)
        const versionEntry = {
          revision: existingDoc.revision || 0,
          files: existingDoc.files || [],
          mimeTypes: existingDoc.mimeTypes || [],
          statusAtThatTime: existingDoc.status,
          submittedAt: existingDoc.submittedAt || null,
          reviewedAt: existingDoc.reviewedAt || null,
          reviewedBy: existingDoc.reviewedBy || null,
          rejectReasonKey: existingDoc.rejectReasonKey || "",
          rejectReasonText: existingDoc.rejectReasonText || "",
          // ✅ keep audit of reminders already sent for that old version
          // ✅ store old reminder history in audit
          expiryReminders: existingDoc.expiryReminders || [],
          lastExpiryReminderAt: existingDoc.lastExpiryReminderAt || null,
          lastExpiryReminderDaysBefore: existingDoc.lastExpiryReminderDaysBefore || null,
        };

        await DRIVER.updateOne(
          { _id: driverId, is_deleted: false, "kyc.documents.type": type },
          {
            $push: { "kyc.documents.$[doc].versions": versionEntry },
            $set: {
              "kyc.documents.$[doc].files": urls,
              "kyc.documents.$[doc].mimeTypes": mimes,
              "kyc.documents.$[doc].status": constant.DOC_STATUS.PENDING,
              "kyc.documents.$[doc].submittedAt": now,

              "kyc.documents.$[doc].reviewedAt": null,
              "kyc.documents.$[doc].reviewedBy": null,
              "kyc.documents.$[doc].rejectReasonKey": "",
              "kyc.documents.$[doc].rejectReasonText": "",

              "kyc.documents.$[doc].revision": nextRevision,
            },
          },
          { arrayFilters: [{ "doc.type": type }] }
        );
      }

       // After re-submit, overall must go back to UNDER_REVIEW
      await DRIVER.updateOne(
        { _id: driverId, is_deleted: false },
        {
          $set: {
            "kyc.verification.status": constant.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW,
            "kyc.verification.isVerified": false,
            "kyc.verification.lastSubmittedAt": now,
            "kyc.canGoOnline": false,
          },
        }
      );

      return res.send({
                        code: constant.success_code,
                        message: res.__("updateDriver.success.resubmitted"),
                      });

    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error get resubmitRejectedDocuments:', err.message);
      return res.send({
        code: constant.error_code,
        message: err.message,
      });
    } 
  });
}

exports.updateDriverProfilePhotoDoc = async (req, res) => {
  driverDocumentsUpload(req, res, async (err) => {

    try {

      console.log("✅ MULTER CALLBACK REACHED"); // tells you multer finished parsing
      if (err) {
        console.log("❌ Multer error driverDocumentsUpload:", err);
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.uploadFailed"),
                      });
      }

      const driverId = req.params.driverId;

      if (!mongoose.Types.ObjectId.isValid(driverId)) {
        return res.send({
                          code: constant.error_code,
                          message: res.__("updateDriver.error.driverNotFound"),
                        });
      }

      const profileFile = (req.files || []).find((f) => f.fieldname === constant.DRIVER_DOC_TYPE.PROFILE_PHOTO)

      if (!profileFile) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.profilePhotoRequired"),
        });
      }

      const newUrl = profileFile.location || profileFile.path;
      const newMime = profileFile.mimetype || "";

      if (!newUrl) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.uploadFailed"),
        });
      }

      // 1) Fetch current PROFILE_PHOTO doc (only that element)
      const docWrap = await DRIVER.findOne(
        { _id: driverId, is_deleted: false, "kyc.documents.type": constant.DRIVER_DOC_TYPE.PROFILE_PHOTO },
        { "kyc.documents.$": 1 }
      ).lean();

      if (!docWrap?.kyc?.documents?.length) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.documentNotFound"),
          docType: constant.DRIVER_DOC_TYPE.PROFILE_PHOTO,
        });
      }


      const currentDoc = docWrap.kyc.documents[0];

      // ✅ Block if currently pending (already under review)
      if (currentDoc.status === constant.DOC_STATUS.PENDING) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.driverDocumentsAlready_under_review"),
        });
      }

      const now = new Date();
      const nextRevision = (currentDoc.revision || 0) + 1;

      // 2) Save old version in versions[] (history)
      const versionEntry = {
        revision: currentDoc.revision || 0,
        files: currentDoc.files || [],
        mimeTypes: currentDoc.mimeTypes || [],
        statusAtThatTime: currentDoc.status || constant.DOC_STATUS.NOT_UPLOADED,
        submittedAt: currentDoc.submittedAt || null,
        reviewedAt: currentDoc.reviewedAt || null,
        reviewedBy: currentDoc.reviewedBy || null,
        rejectReasonKey: currentDoc.rejectReasonKey || "",
        rejectReasonText: currentDoc.rejectReasonText || "",

        // ✅ store old reminder history in audit
        expiryReminders: currentDoc.expiryReminders || [],
        lastExpiryReminderAt: currentDoc.lastExpiryReminderAt || null,
        lastExpiryReminderDaysBefore: currentDoc.lastExpiryReminderDaysBefore || null,
      };

       // 3) Update PROFILE_PHOTO to new file => PENDING + clear review fields
      await DRIVER.updateOne(
        { _id: driverId, is_deleted: false, "kyc.documents.type": constant.DRIVER_DOC_TYPE.PROFILE_PHOTO },
        {
          $push: { "kyc.documents.$[doc].versions": versionEntry },
          $set: {
            "kyc.documents.$[doc].files": [newUrl],
            "kyc.documents.$[doc].mimeTypes": [newMime],
            "kyc.documents.$[doc].status": constant.DOC_STATUS.PENDING,
            "kyc.documents.$[doc].submittedAt": now,

            "kyc.documents.$[doc].reviewedAt": null,
            "kyc.documents.$[doc].reviewedBy": null,
            "kyc.documents.$[doc].rejectReasonKey": "",
            "kyc.documents.$[doc].rejectReasonText": "",

            "kyc.documents.$[doc].revision": nextRevision,
          },
        },
        { arrayFilters: [{ "doc.type": constant.DRIVER_DOC_TYPE.PROFILE_PHOTO }] }
      );


      // 4) Overall verification goes back to UNDER_REVIEW because a doc changed
      await DRIVER.updateOne(
        { _id: driverId, is_deleted: false },
        {
          $set: {
            "kyc.verification.status": constant.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW,
            "kyc.verification.isVerified": false,
            "kyc.verification.lastSubmittedAt": now,
            isDocUploaded: true,
            // (optional) also update visible profile image
            profile_image: newUrl,
          },
        }
      );

      return res.send({
                      code: constant.success_code,
                      message: res.__("updateDriver.success.driverDocumentsUnderReview")
                    });

    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error updateProfilePhotoDoc:', err.message);
      return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
    }
  });
}

exports.createDriverProfileFromCompany = async (req, res) => {

  driverDocumentsUpload(req, res, async (err) => {

    try {

      console.log("✅ MULTER CALLBACK REACHED"); // tells you multer finished parsing
      if (err) {
        console.log("❌ Multer error driverDocumentsUpload:", err);
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.uploadFailed"),
                      });
      }
      
      if (req.user.isDriver) {
        return res.json({
          code: constant.error_code,
          message: res.__("addDriver.error.aleradyHaveAccount"),
        });
      }

      const filesByField = groupFilesByField(req.files || []);
      const uploadedFieldNames = Object.keys(filesByField);
      const invalidFields = uploadedFieldNames.filter(
        (f) => !Object.keys(constant.DRIVER_DOC_TYPE).includes(f)
      );

      if (invalidFields.length > 0) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.invalidFileField"),
                        invalidFields
                      });
      }

      const missingDocs = Object.keys(constant.DRIVER_DOC_TYPE).filter(
        (f) => !filesByField[f] || filesByField[f].length === 0
      );

      if (missingDocs.length > 0) {
        return res.send({
                        code: constant.error_code,
                        message: res.__("updateDriver.error.missingDocuments"),
                        missingDocuments: missingDocs,
                      });
      }

      const { address_1, address_2, gender, nickName ,country, city, zip_code, kvk, VatNumber,  bankNumber,} = req.body;

      const missingText = [];
      if (isEmpty(address_1)) missingText.push("address_1");
      if (isEmpty(gender)) missingText.push("gender");
      if (isEmpty(nickName)) missingText.push("nickName");
      if (isEmpty(country)) missingText.push("country");
      if (isEmpty(city)) missingText.push("city");
      if (isEmpty(zip_code)) missingText.push("zip_code");
      // if (isEmpty(companyName)) missingText.push("companyName");
      if (isEmpty(kvk)) missingText.push("kvk");
      if (isEmpty(VatNumber)) missingText.push("VatNumber");
      if (isEmpty(bankNumber)) missingText.push("bankNumber");

      if (missingText.length > 0) {
        return res.send({
          code: constant.error_code,
          message: res.__("updateDriver.error.missingFields"),
          missingFields: missingText,
        });
      }

      const isnickNameAlreadyTaken =  await DRIVER.findOne( {
                                                              nickName: { $regex: `^${nickName}$`, $options: "i" },
                                                            },
                                                            {nickName: 1 , email:1}
                                                          );

      if (isnickNameAlreadyTaken) {
        return res.send({
          code: constant.error_code,
          message: res.__("addDriver.error.nickNameAlreadyInUse")
        });
      }

      const isEmailAlreadyTaken =  await DRIVER.findOne( {
                                                              email: { $regex: `^${req.user.email}$`, $options: "i" },
                                                            },
                                                            {email:1 , is_delete: 1}
                                                          );

      if (isEmailAlreadyTaken && isEmailAlreadyTaken.is_delete) {
        return res.send({
          code: constant.error_code,
          message: res.__("addDriver.error.emailLinkedToInactiveAccount"),
        });
      }


      const docs =  [];

      const now = new Date();

      // ensure all doc types exist
      for (const field of Object.values(constant.DRIVER_DOC_TYPE)) {
        ensureDocEntry(docs, constant.DRIVER_DOC_TYPE[field]);
      }

       // fill each doc
      for (const field of Object.values(constant.DRIVER_DOC_TYPE)) {
        const type = constant.DRIVER_DOC_TYPE[field];
        const uploadedFiles = filesByField[field];

        const urls = uploadedFiles.map((f) => f.location || f.path).filter(Boolean);
        const mimes = uploadedFiles.map((f) => f.mimetype).filter(Boolean);

        const doc = docs.find((d) => d.type === type);

        doc.files = urls;
        doc.mimeTypes = mimes;
        doc.status = constant.DOC_STATUS.PENDING;
        doc.submittedAt = now;

        doc.reviewedAt = null;
        doc.reviewedBy = null;
        doc.rejectReasonKey = "";
        doc.rejectReasonText = "";

        // first upload reset
        doc.revision = doc.revision || 0;
        doc.versions = doc.versions || [];
      }

      const companyInfo = await USER.aggregate([
                                                  {
                                                    $lookup: {
                                                      from: "agencies", 
                                                      localField: "_id", 
                                                      foreignField: "user_id", 
                                                      as: "agency_data",
                                                    },
                                                  },
                                                  {
                                                    $match: {
                                                      _id: new mongoose.Types.ObjectId(req.userId),
                                                    },
                                                  },
                                                  {
                                                    $project: {
                                                      name: 1, // Include driver name
                                                      user_info: "$$ROOT",
                                                      companyDetails: { $arrayElemAt: ["$agency_data", 0] }, // Include the first matching company
                                                    },
                                                  },
                                                ]);
 
    const company_agency_id = companyInfo ? companyInfo[0].companyDetails._id : null;

     
    let customer = await stripe.customers.list({ email: req.user.email });
    customer = customer?.data.length ? customer.data[0] : await stripe.customers.create({ email: req.user.email });
                                               
    stripeCustomerId = customer.id;
    const driverCounterId = `D-`+ await getDriverNextSequenceValue();

    let updateData = {
              address_1 : toStr(address_1),
              address_2 : isEmpty(address_2) ? "" : toStr(address_2), 
              gender, 
              nickName ,
              country : toStr(country), 
              city : toStr(city), 
              zip_code : toStr(zip_code), 
              companyName : companyInfo[0].companyDetails.company_name, 
              kvk : toStr(kvk), 
              VatNumber : toStr(VatNumber),  
              bankNumber : toStr(bankNumber),
              isDocUploaded: true,
              first_name: companyInfo[0].user_info.first_name,
              last_name: companyInfo[0].user_info.last_name,
              email: companyInfo[0].user_info.email,
              password: companyInfo[0].user_info.password,
              stored_password: companyInfo[0].user_info.stored_password,
              phone: companyInfo[0].user_info.phone,
              isCompany: true,
              created_by: companyInfo[0].user_info._id,
              isDocUploaded: true,
              driver_company_id: req.userId,
              company_agency_id:company_agency_id,
              driverCounterId: driverCounterId,
              stripeCustomerId: stripeCustomerId,
              "kyc.documents": docs,
              "kyc.verification.status": constant.DRIVER_VERIFICATION_STATUS.UNDER_REVIEW,
              "kyc.verification.isVerified": false,
              "kyc.verification.lastSubmittedAt": now,
              "kyc.canGoOnline": false,
            }

            let save_driver = await DRIVER(updateData).save();

            let jwtToken = jwt.sign( { userId: save_driver._id }, process.env.JWTSECRET, { expiresIn: "365d" } );
            
            if (req.isMobile) {
              save_driver.jwtTokenMobile = jwtToken;
            } else { 
              save_driver.jwtToken = jwtToken;
            } 
            const result = save_driver.toObject();
            result.role = "DRIVER";
            req.user.isDriver = true;
      
            req.user.driverId = save_driver._id;
             
            const newUser = await USER.updateOne(
                                                        { _id: req.user._id },
                                                        {
                                                          driverId: save_driver._id,
                                                          isDriver: true,
                                                        }
                                                      );
            await save_driver.save();

            if (!save_driver) {
              return res.send({
                                code: constant.error_code,
                                message: res.__('convertIntoDriver.error.unableToSaveData'),
                              });
            } else {
              return res.send({
                                code: constant.success_code,
                                message: res.__('convertIntoDriver.success.driverCreated'),
                                result,
                                jwtToken,
                              });
            }
    } catch (err) {

      console.log('❌❌❌❌❌❌❌❌❌Error createDriverProfileFromCompany:', err.message);
      return res.send({
                        code: constant.error_code,
                        message: err.message,
                      });
    }
  })
}
exports.changeDriverAvailability = async (req, res) => {

  try {

    let data = req.body;
    let driver_info = await DRIVER.findById(req.userId);
    if (!driver_info) {
      return res.send({
                        code: constant.success_code,
                        message: res.__("getDrivers.error.noDriverFound"),
                      });
      
    }

    // If driver is on ride or on the way then he cant be  offline
    if ([constant.DRIVER_STATE.ON_THE_WAY, constant.DRIVER_STATE.ON_TRIP].includes(driver_info?.driver_state)) {

      return res.send({
                        code: constant.error_code,
                        message: res.__('updateDriver.error.cannotGoOfflineWithActiveTrip')
                      });
    }


    await DRIVER.updateOne( { _id: driver_info?._id }, { $set: {status : data.status} });
    return res.send({
                          code: constant.success_code,
                          message: res.__('updateDriver.success.driverAccountUpdated'),
                          result: data,
                        });
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error change driver availability:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.changeDriverState = async (req, res) => {
  try {
    const { driver_state } = req.body;
    const driver_info = await DRIVER.findById(req.userId);

    if (!driver_info) 
      return res.send({ code: constant.success_code, message: res.__("getDrivers.error.noDriverFound") });

    const validStates = new Set([
      constant.DRIVER_STATE.AVAILABLE,
      constant.DRIVER_STATE.NOT_AVAILABLE,
      constant.DRIVER_STATE.ON_TRIP,
      constant.DRIVER_STATE.ON_THE_WAY
    ]);

    if (!validStates.has(driver_state)) 
      return res.send({ code: constant.error_code, message: res.__('updateDriver.error.invalidState') });

    const blockedStates = new Map([
      [constant.DRIVER_STATE.ON_THE_WAY, 'updateDriver.error.deniedStatusChangeOnTheWay'],
      [constant.DRIVER_STATE.ON_TRIP, 'updateDriver.error.deniedStatusChangeOnTheTrip']
    ]);

    if (blockedStates.has(driver_info.driver_state)) {
      return res.send({
        code: constant.error_code,
        message: res.__(blockedStates.get(driver_info.driver_state))
      });
    }

    await DRIVER.updateOne({ _id: driver_info._id }, { $set: { driver_state } });

    return res.send({
                      code: constant.success_code,
                      message: res.__('updateDriver.success.driverAccountUpdated'),
                      result: { driver_state }
                    });

  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error change driverState:', err.message);
    return res.send({ code: constant.error_code, message: err.message });
  }
};


exports.reset_password = async (req, res) => {
  try {
    let data = req.body;
    let check_id = await DRIVER.findOne({ _id: req.userId });
    if (!check_id) {
      res.send({
        code: constant.success_code,
        message: res.__("getDrivers.error.noDriverFound"),
      });
      return;
    }
    let check_password = await bcrypt.compare(
      data.oldPassword,
      check_id.password
    );
    if (!check_password) {
      res.send({
        code: constant.error_code,
        message: res.__("resetPassword.error.incorrectOldPassword"),
      });
    } else {
      let values = {
        $set: {
          password: bcrypt.hashSync(data.password, 10),
          stored_password: data.password
        },
      };
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_id._id },
        values,
        { new: true }
      );
      if (!updateData) {
        res.send({
          code: constant.error_code,
          message: res.__("resetPassword.error.passwordUpdateFailed"),
        });
      } else {
        res.send({
          code: constant.success_code,
          message: res.__("resetPassword.success.passwordReset"),
          checking: updateData.password,
        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error reset password:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trips_for_driver = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    // let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

    // let search_value = data.comment ? data.comment : ''
    // let ids = []
    // for (let i of getIds) {
    //     ids.push(i._id)
    // }
    // const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    let search_value = data.comment ? data.comment : "";

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { driver_name: mid },
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            { comment: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by",
          foreignField: "_id",
          as: "userData",
          pipeline: [
            {
              $lookup: {
                from: "agencies",
                localField: "_id",
                foreignField: "user_id",
                as: "agency",
              },
            },
            {
              $lookup: {
                from: "agencies",
                localField: "created_by",
                foreignField: "user_id",
                as: "company_agency",
              },
            },
            {
              $lookup: {
                from: "users",
                localField: "created_by",
                foreignField: "_id",
                as: "company_user",
              },
            },
            {
              $unwind: {
                path: "$agency",
              },
            },
            {
              $unwind: {
                path: "$company_agency",
              },
            },
            {
              $unwind: {
                path: "$company_user",
              },
            },
            // {
            //     $project: {
            //         'company_name': { $arrayElemAt: ["$agency.company_name", 0] },
            //         'cvompany_name': { $arrayElemAt: ["$agency.phone", 0] },
            //     }
            // }
          ],
        },
      },
      {
        $unwind: {
          path: "$userData",
        },
      },
      {
        $project: {
          _id: 1,
          // userData: 1,
          customer_phone: "$userData.phone",
          trip_from: 1,
          trip_to: 1,
          is_paid: 1,
          pickup_date_time: 1,
          trip_status: 1,
          price: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          customerDetails: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          company_name: "$userData.agency.company_name",
          user_company_name: "$userData.company_agency.company_name",
          user_company_phone: "$userData.company_user.phone",
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          vehicle: {
            $concat: [
              { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
              " ",
              { $arrayElemAt: ["$vehicle.vehicle_model", 0] },
            ],
          },
          trip_id: 1,
        },
      },
    ]).sort({ createdAt: -1 });
    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noDataFound")
      });
    } else {
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.ACTIVE,
      }).countDocuments();
      const totalUnpaidTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.COMPLETED,
        is_paid: false,
        drop_time: {
          $lte: startOfCurrentWeek,
        },
      }).countDocuments();

      const totalReachedTrip = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.REACHED,
        is_paid: false,
      }).countDocuments();

      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripDataRetrieved"),
        result: get_trip,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trips for drivers:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_trips_for_drivers = async (req, res) => {
  try {
    let data = req.body;
    let mid = new mongoose.Types.ObjectId(req.userId);
    // let getIds = await USER.find({ role: 'HOTEL', created_by: req.userId })

    // let search_value = data.comment ? data.comment : ''
    // let ids = []
    // for (let i of getIds) {
    //     ids.push(i._id)
    // }
    // const objectIds = ids.map((id) => new mongoose.Types.ObjectId(id));
    let search_value = data.comment ? data.comment : "";

    let get_trip = await TRIP.aggregate([
      {
        $match: {
          $and: [
            { driver_name: mid },
            { status: true },
            { trip_status: req.params.status },
            { is_deleted: false },
            { comment: { $regex: search_value, $options: "i" } },
          ],
        },
      },
      {
        $lookup: {
          from: "drivers",
          localField: "driver_name",
          foreignField: "_id",
          as: "driver",
        },
      },
      {
        $lookup: {
          from: "vehicles",
          localField: "vehicle",
          foreignField: "_id",
          as: "vehicle",
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "hotel_id",
          foreignField: "user_id",
          as: "hotelData",
        },
      },

      {
        $lookup: {
          from: "agencies",
          localField: "created_by_company_id",
          foreignField: "user_id",
          as: "userData",
        },
      },
      {
        $lookup: {
          from: "users",
          localField: "created_by_company_id",
          foreignField: "_id",
          as: "companyData",
        },
      },
      {
        $unwind: {
          path: "$userData",
        },
      },
      {
        $project: {
          _id: 1,
          // userData: 1,
          customer_phone: "$userData.p_number",
          company_phone:{ $arrayElemAt: ["$companyData.phone", 0] },
          trip_from: 1,
          trip_to: 1,
          is_paid: 1,
          pickup_date_time: 1,
          trip_status: 1,
          price: 1,
          createdAt: 1,
          created_by: 1,
          status: 1,
          passenger_detail: 1,
          customerDetails: 1,
          vehicle_type: 1,
          comment: 1,
          commission: 1,
          pay_option: 1,
          company_name: "$userData.company_name",
          user_company_name: "$userData.company_name",
          user_company_phone: "$userData.phone",
          hotel_name: { $arrayElemAt: ["$hotelData.company_name", 0] },
          driver_name: {
            $concat: [
              { $arrayElemAt: ["$driver.first_name", 0] },
              " ",
              { $arrayElemAt: ["$driver.last_name", 0] },
            ],
          },
          vehicle: {
            $concat: [
              { $arrayElemAt: ["$vehicle.vehicle_number", 0] },
              " ",
              { $arrayElemAt: ["$vehicle.vehicle_model", 0] },
            ],
          },
          trip_id: 1,
          hosted_invoice_url:1,
          invoice_pdf:1,
          car_type:1
        },
      },
    ]).sort({ createdAt: -1 });


    if (!get_trip) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noDataFound"),
      });
    } else {
      let currentDate = new Date();
      let startOfCurrentWeek = new Date(currentDate);
      startOfCurrentWeek.setHours(0, 0, 0, 0);
      startOfCurrentWeek.setDate(
        startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay()
      );
      const totalActiveTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.ACTIVE,
      }).countDocuments();
      const totalUnpaidTrips = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.COMPLETED,
        is_paid: false,
        drop_time: {
          $lte: startOfCurrentWeek,
        },
      }).countDocuments();

      const totalReachedTrip = await TRIP.find({
        driver_name: req.userId,
        trip_status: constant.TRIP_STATUS.REACHED,
        is_paid: false,
      }).countDocuments();

      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripDataRetrieved"),
        result: get_trip,
        totalActiveTrips,
        totalUnpaidTrips,
        totalReachedTrip,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get trip for drive:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getAllTripsForDrivers = async (req, res) => {
  try {

    let data = req.body;
    let id = new mongoose.Types.ObjectId(req.userId);
    
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 50);
    const skip = (page - 1) * limit;

    const statusParam = (req.params.status || "").toString().trim();

    let   criteria =  {
                        status: true,
                        trip_status: statusParam,
                        is_deleted: false,
                      };

    if (req.user.role == constant.ROLES.COMPANY) {

      criteria.created_by_company_id =  id;
    } else if (req.user.role == constant.ROLES.DRIVER ) {

      criteria.driver_name = id;

      if (statusParam === constant.TRIP_STATUS.BOOKED) {
        criteria.trip_status = { $in: [constant.TRIP_STATUS.BOOKED, constant.TRIP_STATUS.REACHED] }; // driver will get both status because frontend need cancellation review true also when booked
      }
      
    }

    const now = new Date();
    const startOfCurrentWeek = new Date(now);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate(startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay());

    // 1) Trips (count + paginated list + lookups only for that page)

    // -------------------------
    const tripsPipeline = [
      { $match: criteria },

      // ✅ Robust sorting even if pickup_date_time is ISO string sometimes
      { $addFields: { sortPickupDate: { $toDate: "$pickup_date_time" } } },

      // ✅ ASC (8 then 9 then 10...) + stable tie-breaker
      { $sort: { sortPickupDate: 1, _id: 1 } },

      {
        $facet: {
          meta: [{ $count: "totalCount" }],
          list: [
            { $skip: skip },
            { $limit: limit },

            // ---- Lookups after pagination (FAST) ----
            {
              $lookup: {
                from: "drivers",
                let: { driverId: "$driver_name" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$driverId"] } } },
                  { $project: { _id: 1, first_name: 1, last_name: 1 , phone: 1 , countryCode:1} },
                ],
                as: "driver",
              },
            },
            { $unwind: { path: "$driver", preserveNullAndEmptyArrays: true } },

            {
              $lookup: {
                from: "vehicles",
                let: { vehicleId: "$vehicle" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$vehicleId"] } } },
                  { $project: { _id: 1, vehicle_number: 1, vehicle_model: 1 } },
                ],
                as: "vehicleDoc",
              },
            },
            { $unwind: { path: "$vehicleDoc", preserveNullAndEmptyArrays: true } },

            {
              $lookup: {
                from: "agencies",
                let: { hotelUserId: "$hotel_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$user_id", "$$hotelUserId"] } } },
                  { $project: { _id: 1, company_name: 1 } },
                ],
                as: "hotelData",
              },
            },
            { $unwind: { path: "$hotelData", preserveNullAndEmptyArrays: true } },

            {
              $lookup: {
                from: "agencies",
                let: { companyUserId: "$created_by_company_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$user_id", "$$companyUserId"] } } },
                  { $project: { _id: 1, company_name: 1, phone: 1, p_number: 1 } },
                ],
                as: "userData",
              },
            },
            { $unwind: { path: "$userData", preserveNullAndEmptyArrays: true } },

            {
              $lookup: {
                from: "users",
                let: { companyId: "$created_by_company_id" },
                pipeline: [
                  { $match: { $expr: { $eq: ["$_id", "$$companyId"] } } },
                  { $project: { _id: 1, phone: 1, countryCode: 1 } },
                ],
                as: "companyData",
              },
            },
            { $unwind: { path: "$companyData", preserveNullAndEmptyArrays: true } },

            {
              $project: {
                _id: 1,
                trip_id: 1,
                trip_from: 1,
                trip_to: 1,
                pickup_date_time: 1,
                pickup_timezone: 1,
                trip_status: 1,
                createdAt: 1,
                created_by: 1,
                booking_source:1,
                booking_channel:1,
                is_paid: 1,
                passengerCount: 1,
                price: 1,
                car_type: 1,
                vehicle_type: 1,
                passenger_detail: 1,
                customerDetails: 1,
                payment_method_price: 1,
                child_seat_price: 1,
                comment: 1,
                commission: 1,
                pay_option: 1,
                navigation_mode: 1,
                status: 1,

                customer_phone: "$userData.p_number",
                company_name: "$userData.company_name",
                user_company_name: "$userData.company_name",
                user_company_phone: "$userData.phone",

                company_phone: "$companyData.phone",
                company_country_code: "$companyData.countryCode",

                hotel_name: "$hotelData.company_name",

                driver_name: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ["$driver.first_name", ""] },
                        " ",
                        { $ifNull: ["$driver.last_name", ""] },
                      ],
                    },
                  },
                },
                driver_country_code: "$driver.countryCode",
                driver_phone: "$driver.phone",
                vehicle: {
                  $trim: {
                    input: {
                      $concat: [
                        { $ifNull: ["$vehicleDoc.vehicle_number", ""] },
                        " ",
                        { $ifNull: ["$vehicleDoc.vehicle_model", ""] },
                      ],
                    },
                  },
                },
              },
            },
          ],
        },
      },
      {
        $project: {
          list: 1,
          totalCount: { $ifNull: [{ $arrayElemAt: ["$meta.totalCount", 0] }, 0] },
        },
      },
    ];

     // -------------------------
    // 2) Driver stats in ONE query (instead of 4 queries)
    // -------------------------
    const statsPipeline = [
      { $match: { driver_name: id } },
      {
        $facet: {
          totalActiveTrips: [
            { $match: { trip_status: constant.TRIP_STATUS.ACTIVE } },
            { $count: "count" },
          ],
          totalUnpaidTrips: [
            {
              $match: {
                trip_status: constant.TRIP_STATUS.COMPLETED,
                is_paid: false,
                drop_time: { $lte: startOfCurrentWeek },
              },
            },
            { $count: "count" },
          ],
          totalReachedTrip: [
            {
              $match: {
                trip_status: constant.TRIP_STATUS.REACHED,
                is_paid: false,
                under_cancellation_review: false,
              },
            },
            { $count: "count" },
          ],
          underCancellationReview: [
            { $match: { under_cancellation_review: true } },
            // if you only need count, comment next line & keep count only
            // { $project: { _id: 1, trip_id: 1, pickup_date_time: 1, trip_status: 1 } },
            { $addFields: { sortPickupDate: { $toDate: "$pickup_date_time" } } },
            { $sort: { sortPickupDate: 1, _id: 1 } },
          ],
        },
      },
      {
        $project: {
          totalActiveTrips: { $ifNull: [{ $arrayElemAt: ["$totalActiveTrips.count", 0] }, 0] },
          totalUnpaidTrips: { $ifNull: [{ $arrayElemAt: ["$totalUnpaidTrips.count", 0] }, 0] },
          totalReachedTrip: { $ifNull: [{ $arrayElemAt: ["$totalReachedTrip.count", 0] }, 0] },
          underCancellationReview: 1,
          totalUndercancellationReview: { $size: "$underCancellationReview" },
        },
      },
    ];

    // Run in parallel (reduces API time)
    // -------------------------
    const [tripsAgg, statsAgg, plans] = await Promise.all([
      TRIP.aggregate(tripsPipeline).allowDiskUse(true),
      req.user.role === constant.ROLES.DRIVER ? TRIP.aggregate(statsPipeline).allowDiskUse(true) : Promise.resolve([]),
      getUserActivePaidPlans(req.user),
    ]);

    const tripsResult = tripsAgg?.[0] || { list: [], totalCount: 0 };
    const statsResult = statsAgg?.[0] || {
      totalActiveTrips: 0,
      totalUnpaidTrips: 0,
      totalReachedTrip: 0,
      underCancellationReview: [],
      totalUndercancellationReview: 0,
    };


    return res.send({
                      code: constant.success_code,
                      message: res.__("getTrip.success.tripDataRetrieved"),
                      activePlans: plans.length > 0 ? true  : false,
                      totalCount: tripsResult.totalCount,
                      result: tripsResult.list,
                      
                      totalActiveTrips: statsResult.totalActiveTrips,
                      totalUnpaidTrips: statsResult.totalUnpaidTrips,
                      totalReachedTrip: statsResult.totalReachedTrip,

                      totalUndercancellationReview: statsResult.totalUndercancellationReview,
                      totalUndercancellationTrip: statsResult.underCancellationReview,
                    });
    
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get all trips for Driversss:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getDriverTrips = async (req, res) => {
  try{

    let driverId = new mongoose.Types.ObjectId(req.userId);

    const page = req.query.page;
    const limit = req.query.limit;
    const tripStatus =  (req.params.status || constant.TRIP_STATUS.BOOKED).toString().trim();

    let currentDate = new Date();
    let startOfCurrentWeek = new Date(currentDate);
    startOfCurrentWeek.setHours(0, 0, 0, 0);
    startOfCurrentWeek.setDate( startOfCurrentWeek.getDate() - startOfCurrentWeek.getDay());

    const [tripData, activePlans, totalUnpaidTrips] = await Promise.all([
      getDriverTripsRanked(driverId, tripStatus, { page, limit }),

      getUserActivePaidPlans(req.user),

      TRIP.countDocuments({
        driver_name: driverId,
        trip_status: constant.TRIP_STATUS.COMPLETED,
        is_paid: false,
        drop_time: { $lte: startOfCurrentWeek },
      }),
    ]);
    return res.send({
                      code: constant.success_code,
                      message: res.__("getTrip.success.tripDataRetrieved"),
                      activePlans: activePlans.length > 0 ? true  : false,
                      totalUnpaidTrips:totalUnpaidTrips,
                      totalCount: tripData.totalCount,
                      page: tripData.page,
                      limit: tripData.limit,
                      result: tripData.trips,
                      
                    });

  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error getDriverTrips driver controller:', err.message);
    res.send({
      code: constant.error_code,
      message: res.__("common.error.somethingWentWrong"),
    });
  }
}

exports.getTripsCountForDrivers = async (req, res) => {

  try {

    let id = new mongoose.Types.ObjectId(req.userId);

    let criteria = {};

    if (req.user.role == constant.ROLES.COMPANY) {

      criteria =  {
                    created_by_company_id: id,
                    status: true,
                    trip_status: req.params.status,
                    is_deleted: false
                  }
    } else if (req.user.role == constant.ROLES.DRIVER ) {

      criteria =  {
                    driver_name: id,
                    status: true,
                    trip_status: {
                      $in: [
                              constant.TRIP_STATUS.BOOKED,
                              constant.TRIP_STATUS.ACTIVE,
                              constant.TRIP_STATUS.REACHED,
                            ],
                    },
                    is_deleted: false
                  }
    }


    let get_trip =  await TRIP.countDocuments(criteria);
    
    return res.send({
                      code: constant.success_code,
                      count: get_trip,
                    });

  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌Error get trips count for drivers:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.getUnderTripCancelledTripsCountForDrivers = async (req, res) => {

  try {

    let id = new mongoose.Types.ObjectId(req.userId);

    let criteria =  {
                    created_by_company_id: id,
                    status: true,
                    under_cancellation_review: true,
                    is_deleted: false
                  }
   


    let get_trip =  await TRIP.countDocuments(criteria);
    
    return res.send({
                      code: constant.success_code,
                      count: get_trip,
                    });

  } catch (err) {
    console.log('❌❌❌❌❌❌❌❌❌Error get underCancelledTrip dicision:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.login = async (req, res) => {
  try {
    let data = req.body;
    let check_phone = await DRIVER.findOne({ email: data.email });

    if (!check_phone) {
      res.send({
        code: constant.error_code,
        message: res.__("userLogin.error.incorrectCredentials"),
      });
      return;
    }
    let check_password = await bcrypt.compare(
      data.password,
      check_phone.password
    );

    if (!check_password) {
      res.send({
        code: constant.error_code,
        message: res.__("userLogin.error.incorrectCredentials"),
      });
    } else {
      let jwtToken = jwt.sign(
        { userId: check_phone._id },
        process.env.JWTSECRET,
        { expiresIn: "365d" }
      );
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_phone._id },
        { OTP: "A0", jwtToken: jwtToken },
        { new: true }
      );
      res.send({
        code: constant.success_code,
        message: res.__("userLogin.success.loginWelcome"),
        result: updateData,
        jwtToken: jwtToken,
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error login:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.verify_otp = async (req, res) => {
  try {
    let data = req.body;
    let check_id = await DRIVER.findOne({ _id: data.driverId });
    if (!check_id) {
      res.send({
        code: constant.error_code,
        message: res.__("getDrivers.error.noDriverFound"),
      });
    } else {
      let jwtToken = jwt.sign({ userId: check_id._id }, process.env.JWTSECRET, {
        expiresIn: "365d",
      });
      let updateData = await DRIVER.findOneAndUpdate(
        { _id: check_id._id },
        { OTP: "A0", jwtToken: jwtToken },
        { new: true }
      );
      if (!updateData) {
        res.send({
          code: constant.error_code,
          message: res.__("getDrivers.error.unbaleToUpdate"),
        });
      } else {
        res.send({
          code: constant.success_code,
          message: res.__("userLogin.success.loginWelcome"),
          result: updateData,
        });
      }
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error verify otp:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.get_reports = async (req, res) => {
  try {
    let data = req.body;
    let query;
    if (data.filter_type == "all") {
      query = [
        { status: true },
        { is_paid: true },
        { trip_status: constant.TRIP_STATUS.COMPLETED },

        { driver_name: new mongoose.Types.ObjectId(req.userId) },
      ];
    } else {
      query = [
        { status: true },
        { is_paid: true },
        { trip_status: constant.TRIP_STATUS.COMPLETED },
        { driver_name: new mongoose.Types.ObjectId(req.userId) },
        {
          pickup_date_time: {
            $gte: new Date(data.from_date),
            $lt: new Date(data.to_date),
          },
        },
      ];
    }

    let get_data = await TRIP.find({
      $and: query,
    });
    const totalPrice = get_data.reduce((sum, obj) => {
      let commission = obj?.commission?.commission_value || 0;
      if (obj?.commission?.commission_type === constant.TRIP_COMMISSION_TYPE.PERCENTAGE) {
        commission = (obj.price / 100) * obj.commission.commission_value;
      }
      return sum + obj.price - commission;
    }, 0);
    if (!get_data) {
      res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noDataFound"),
      });
    } else {
      res.send({
        code: constant.success_code,
        message: res.__("getTrip.success.tripDataRetrieved"),
        result: {
          trips: get_data.length,
          earning: totalPrice,
          get_data,
        },
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get reports:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.company_access_list = async (req, res) => {
  try {
    const companyIds = req.user.company_account_access.map(
      (access) => access.company_id
    );
    // const company_access_list = await USER.find({ _id: { $in: companyIds } });

    const company_access_list = await USER.aggregate([
      {
        $match: {
          $and: [{ _id: { $in: companyIds } }],
        },
      },
      {
        $lookup: {
          from: "agencies",
          localField: "_id",
          foreignField: "user_id",
          as: "company_data",
        },
      },
      {
        $unwind: {
          path: "$company_data",
        },
      },

      {
        $project: {
          _id: 1,
          first_name: 1,
          last_name: 1,
          email: 1,
          countryCode:1,
          // phone: "$company_data.p_number",
          phone: 1,
          company_name: "$company_data.company_name",
          address_1: "$company_data.land",
        },
      },
    ]);

    if (company_access_list.length > 0) {
      res.send({
        code: constant.success_code,
        data: company_access_list,
      });
    } else {
      res.send({
        code: constant.error_code,
        message: res.__("updateAccountAccess.error.accessNotAssigned"),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error company access list:', err.message);
    res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.favoriteDriver = async (req, res) => {
  try {
    const driverId = new mongoose.Types.ObjectId(req.params.id);
    const driver = await DRIVER.findById(driverId);
    if (!driver) {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.inValidDriver"),
                      });
    }

    const user = req.user;
    const isFavorite = user.favoriteDrivers.some(id => id.equals(driverId)); // Check if driver is already in the favorites

    if (!isFavorite) {

      // Add driver to the user's favorite list
      user.favoriteDrivers.push(driverId);
      // await user.save();
      await DRIVER.updateOne( { _id: user._id },  { $set: {favoriteDrivers: user.favoriteDrivers} }  );
      return res.send({
                        code: constant.success_code,
                        message: res.__("favoriteDriver.success.driverAdded"),
                      });
    } else {
      user.favoriteDrivers = user.favoriteDrivers.filter(id => !id.equals( driverId ));
      await DRIVER.updateOne( { _id: user._id },  { $set: {favoriteDrivers: user.favoriteDrivers} }  );
      return res.send({
        code: constant.success_code,
        message: res.__("favoriteDriver.success.driverRemoved"),
      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error fave driverr:', err.message);

    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
};

exports.getDriverList = async (req, res) => {
  let api_start_time = new Date();

  try {
    const agencyUserId = req.userId; // Assuming you have user authentication and user ID in the request
    let getDetail = await DRIVER.findOne({ _id: req.userId });

    const search = req.query.search || "";
    const query = { is_deleted: false, };
    if (search.length > 0) {
      query.$or = [
                    { email: { $regex: search, $options: "i" } },
                    { phone: { $regex: search, $options: "i" } },
                    { first_name: { $regex: search, $options: "i" } },
                    { last_name: { $regex: search, $options: "i" } },
                    { address_1: { $regex: search, $options: "i" } },
                    { nickName: { $regex: search, $options: "i" } },
                  ];
    }

    const driver = await DRIVER.find(query, {
                                              _id: 1,
                                              profile_image: 1,
                                              first_name: 1,
                                              last_name: 1,
                                              phone: 1,
                                              status: 1,
                                              is_login: 1,
                                              nickName:1,
                                              isVerified: 1,
                                              kvc:1
                                            }
                                    );
                                    
    if (driver) {
      const favorite_driver = getDetail?.favoriteDrivers ? getDetail.favoriteDrivers.map((id) => id.toString()) : [];

      const result = driver.map((d) => {
                                        const driverObj = d.toObject();
                                        let isFavorite = false;
                                        if (favorite_driver.includes(driverObj._id.toString())) { isFavorite = true; }
                                        driverObj.isFavorite = isFavorite;
                                        return driverObj;
                                      }
                                );

      // Sort so that items with isFavorite: true come first

      if (result.length > 0) {
        result.sort((a, b) => b.isFavorite - a.isFavorite);
      }
      
      return res.send({
                        code: constant.success_code,
                        message: res.__("getDrivers.success.driverListRetrieved"),
                        result: result,
                      });
    } else {
      return res.send({
                        code: constant.error_code,
                        message: res.__("getDrivers.error.noDriverFoundForAgency"),
                      });
    }
  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get driverss list:', err.message);
    console.log("🚀 ~ exports.get_driver= ~ err:", err);

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
};

exports.getRideWithCompany = async (req, res) => {
  try {

    const unique_trip_code = req.params.unique_trip_code;
    const tripExist = await TRIP.findOne({ unique_trip_code: unique_trip_code })
                                .select(' customerDetails , pickup_date_time , passengerCount , price , payment_method_price , child_seat_price , created_by_company_id , pay_option , trip_from  , trip_to , driver_name , car_type_id , car_type , vehicle_type , trip_id , trip_status , cancellation_reason');

    if (!tripExist) {
      return res.send({
        code: constant.error_code,
        message: res.__("getTrip.error.noTripFound"),
      });
    }

    const ratingDetail = await RATING_MODEL.exists({ trip_id: tripExist._id  , driver_id: tripExist.driver_name })
    // const companyDetails = await USER.findById(tripExist.created_by_company_id).select('first_name last_name email settings , countryCode , phone');
    const companyDetails = await USER.aggregate([
                                                  {
                                                    $match: {
                                                      _id: new mongoose.Types.ObjectId(tripExist.created_by_company_id)
                                                    }
                                                  },
                                                  {
                                                    $lookup: {
                                                      from: "agencies",              // collection name
                                                      localField: "_id",             // user._id
                                                      foreignField: "user_id",       // agency.user_id
                                                      as: "agencyData"
                                                    }
                                                  },
                                                  {
                                                    $unwind: {
                                                      path: "$agencyData",
                                                      preserveNullAndEmptyArrays: true      // user may not have agency
                                                    }
                                                  },
                                                  {
                                                    $project: {
                                                      first_name: 1,
                                                      last_name: 1,
                                                      email: 1,
                                                      settings: 1,
                                                      phone: 1,
                                                      countryCode: 1,
                                                      company_name: "$agencyData.company_name",   // get company name
                                                      website: "$agencyData.website",   // get company name
                                                    }
                                                  }
                                                ]);
        const driverDetails = await DRIVER.findById(tripExist.driver_name).select('first_name , last_name , countryCode , phone , defaultVehicle , is_in_ride , location').populate({
        path: "defaultVehicle",
        select: "vehicle_number vehicle_type vehicle_model vehicle_make"
      });
    // let companyDetail = await USER.aggregate([
    //                                           {
    //                                             $match: {
    //                                               _id: tripExist.created_by_company_id,
    //                                             },
    //                                           },
    //                                           // {
    //                                           //   $lookup: {
    //                                           //     from: "agencies",
    //                                           //     localField: "_id",
    //                                           //     foreignField: "user_id",
    //                                           //     as: "meta",
    //                                           //   },
    //                                           // },
    //                                           {
    //                                             $project: {
    //                                               _id: 1,
    //                                               first_name: 1,
    //                                               last_name: 1,
    //                                               email: 1,
    //                                               user_name: 1 ,
    //                                               // company_id:1,
    //                                               // created_by: 1,
    //                                               // phone: 1,
    //                                               // countryCode:1,
    //                                               // profile_image: 1,
    //                                               // role: 1,
    //                                               // status: 1,
    //                                               // logo: 1,
    //                                               // background_color: 1,
    //                                               // color:1,
    //                                               // stored_password:1,
    //                                               // totalBalance: 1,
    //                                               settings:1,
    //                                               // land: { $arrayElemAt: ["$meta.land", 0] },
    //                                               // post_code: { $arrayElemAt: ["$meta.post_code", 0] },
    //                                               // house_number: { $arrayElemAt: ["$meta.house_number", 0] },
    //                                               // description: { $arrayElemAt: ["$meta.description", 0] },
    //                                               // affiliated_with: { $arrayElemAt: ["$meta.affiliated_with", 0] },
    //                                               // p_number: { $arrayElemAt: ["$meta.p_number", 0] },
    //                                               // number_of_cars: { $arrayElemAt: ["$meta.number_of_cars", 0] },
    //                                               // chamber_of_commerce_number: {
    //                                               //   $arrayElemAt: ["$meta.chamber_of_commerce_number", 0],
    //                                               // },
    //                                               // vat_number: { $arrayElemAt: ["$meta.vat_number", 0] },
    //                                               // website: { $arrayElemAt: ["$meta.website", 0] },
    //                                               // tx_quality_mark: { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
    //                                               // saluation: { $arrayElemAt: ["$meta.saluation", 0] },
    //                                               // company_name: { $arrayElemAt: ["$meta.company_name", 0] },
    //                                               // company_id: { $arrayElemAt: ["$meta.company_id", 0] },
    //                                               // location: { $arrayElemAt: ["$meta.location", 0] },
    //                                               // hotel_location: { $arrayElemAt: ["$meta.hotel_location", 0] },
    //                                               // commision: { $arrayElemAt: ["$meta.commision", 0] },
    //                                             },
    //                                           },
    //                                         ]);
    
    return res.send({
      code: constant.success_code,
      message: unique_trip_code,
      driverDetails:driverDetails,
      trip_detail : tripExist,
      companyDetails: companyDetails,
      rating: ratingDetail ? true : false
    });


  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error getRideWithCompany:', err.message);

    return res.send({
      code: constant.error_code,
      message: err.message,
    });
  }
}

exports.updateDriverLocation = async (req, res) => {

  try{
    const data = req.body;

    console.log("data location getting from background------", data , new Date().toLocaleString())
    return res.send({
                      code: constant.success_code,
                      message: "location getting",
                      data
                    });

  } catch (err) {

    console.log('❌❌❌❌❌❌❌❌❌Error get updateDriverLocation:', err.message);
    console.log("🚀 ~ exports.updateDriverLocation= ~ err:", err);

    return res.send({
                      code: constant.error_code,
                      message: err.message,
                    });
  }
  
}