const CONSTANT = require("../config/constant");
const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";
const toStr = (v) => (v === undefined || v === null ? "" : String(v).trim());
const groupFilesByField = (files = []) => {
  const out = {};
  for (const f of files) {
    if (!out[f.fieldname]) out[f.fieldname] = [];
    out[f.fieldname].push(f);
  }
  return out;
}

const fileUrl = (f) => {
  // multer-s3 provides `location`
  return f?.location || f?.path || "";
}

const ensureDocEntry = (docs, type) => {
  const exists = docs.find((d) => d.type === type);
  if (exists) return exists;

  const newDoc = {
    type,
    files: [],
    mimeTypes: [],
    status: CONSTANT.DOC_STATUS.NOT_UPLOADED,
    submittedAt: null,
    reviewedAt: null,
    reviewedBy: null,
    rejectReasonKey: "",
    rejectReasonText: "",
    revision: 0,
    versions: [],
  };

  docs.push(newDoc);
  return newDoc;
}

const  normalizeToEndOfDay = (dateInput) => {

  // set expiration date with end of the day
  const date = new Date(dateInput);
  date.setUTCHours(23, 59, 59, 999); // last moment of the day
  return date;
}
module.exports = {
  isEmpty,
  toStr , 
  groupFilesByField , 
  fileUrl,
  ensureDocEntry,
  normalizeToEndOfDay
};