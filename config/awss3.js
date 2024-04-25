require("dotenv").config();
const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');
const { S3Client } = require('@aws-sdk/client-s3');
// Configure AWS SDK with your credentials
aws.config.update({
  accessKeyId: process.env.AWS_ACCESS,
  secretAccessKey: process.env.AWS_SECRET,
  region: process.env.S3_REGION,
});

// Create a new instance of the S3 service
// const s3 = new aws.S3();
let s3 = new S3Client({
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS,
    secretAccessKey: process.env.AWS_SECRET,
  },
  sslEnabled: false,
  s3ForcePathStyle: true,
  signatureVersion: 'v4',
});

// Set up multer-s3 storage
const imageStorage = multerS3({
  s3: s3,
  bucket: process.env.AWS_BUCKETNAME,
  contentType: multerS3.AUTO_CONTENT_TYPE,
  acl: 'public-read', // Access control for uploaded files
  key: (req, files, cb) => {
    // Generate a unique key for the uploaded file
    const uniqueId = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, `taxibooking/item-${uniqueId}`);
  }
})
module.exports = imageStorage