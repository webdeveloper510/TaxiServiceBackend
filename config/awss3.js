require("dotenv").config();
const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');

// Configure AWS SDK with your credentials
aws.config.update({
  accessKeyId: process.env.AWS_ACCESS,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.S3_REGION,
});

// Create a new instance of the S3 service
const s3 = new aws.S3();

// Set up multer-s3 storage
const imageStorage = multerS3({
  s3: s3,
  bucket: process.env.AWS_BUCKETNAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  acl: 'public-read', // Access control for uploaded files
  key: (req, file, cb) => {
    // Set unique key for the uploaded file
    cb(null, `TaxiBooking/${Date.now()}-${Math.round(Math.random() * 1e9)}`);
  }
});
module.exports = imageStorage