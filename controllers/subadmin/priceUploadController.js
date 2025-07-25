
const USER = require('../../models/user/user_model')
const PRICE_MODEL = require('../../models/user/price_model')
const constant = require('../../config/constant')
const multer = require("multer");
const xlsx = require("xlsx");
// Multer setup (Store file in memory, not disk)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single("file");

exports.priceUpload = async (req, res) => {
    try {

        upload(req, res, async function (err) {
            if (err) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.fileUploadFailed")
                                });
            }

            if (!req.user.role == constant.ROLES.COMPANY) {

                return res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.accessDenied")
                                });
            }

            if (!req.file) {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.fileNotFound")
                                });
            }

            if (req.body.upload_price_type == undefined || req.body.upload_price_type == '') {
                return res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.invalidPriceType")
                                });
            }

           

            const fileBuffer = req.file.buffer;
            const workbook = xlsx.read(fileBuffer, { type: "buffer" });

            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet);

            if (jsonData.length === 0) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("priceUpload.error.noDataFound")
                });
            }

           let  requiredColumns =  Object.values(req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? constant.ZIP_CODE_UPLOAD_TYPE_REQUIRED_COLUMNS : constant.ADDRESS_UPLOAD_TYPE_REQUIRED_COLUMNS);
           let  requiredFields =  Object.values(req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? constant.ZIP_CODE_UPLOAD_TYPE_REQUIRED_FIELDS : constant.ADDRESS_UPLOAD_TYPE_REQUIRED_FIELDS);
        
            // Get column names from the sheet
            const sheetColumns = Object.keys(jsonData[0]);
            const missingColumns = requiredColumns.filter(col => !sheetColumns.includes(col));
            const extraColumns = sheetColumns.filter(col => !requiredColumns.includes(col));

            if (missingColumns.length > 0) {
                return res.send({
                    code: constant.error_code,
                    message: res.__("priceUpload.error.missingColumns", { columns: missingColumns.join(", ") })
                });
            }

            if (extraColumns.length > 0) {
                return res.send({
                    code: constant.error_code,
                    message:  res.__("priceUpload.error.unexpectedExtraColumns", { columns: extraColumns.join(", ") })
                });
            }

            // ✅ ZIP code validator for NL
            const isValidNetherlandsZipcode = (zip) => {
                const zipRegex = /^[1-9][0-9]{3}\s?[A-Z]{2}$/;
                return zipRegex.test(zip?.toString().toUpperCase().trim());
            };

            // Validate each row for empty values
            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];

                for (const field of requiredFields) {
                    if (!row[field] || row[field].toString()?.trim() === "") {
                        return res.send({
                            code: constant.error_code,
                            message: res.__("priceUpload.error.emptyRowFields", { row_no: i + 2, field: field })
                        });
                    }
                }


                // Validate "Amount" field
                if (!row["Amount"] || isNaN(row["Amount"])) {
                    return res.send({
                        code: constant.error_code,
                        message: res.__("priceUpload.error.inValidAmount", { row_no: i + 2 })
                    });
                }

                // ✅ Check ZIP code format if NL
                if ( req.body.upload_price_type === constant.UPLOADED_PRICE_TYPE.ZIP_CODE ) {
                    const departureZip = row["Departure Zipcode"]?.toString().toUpperCase().trim();
                    const arrivalZip = row["Arrival Zipcode"]?.toString().toUpperCase().trim();

                    if (!isValidNetherlandsZipcode(departureZip)) {
                    return res.send({
                        code: constant.error_code,
                        message: res.__("priceUpload.error.invalidZipcode", { row_no: i + 2, field: "Departure Zipcode" })
                    });
                    }

                    if (!isValidNetherlandsZipcode(arrivalZip)) {
                    return res.send({
                        code: constant.error_code,
                        message: res.__("priceUpload.error.invalidZipcode", { row_no: i + 2, field: "Arrival Zipcode" })
                    });
                    }
                }
            }
            

            const bulkOps = jsonData.map(value => {
                const normalizeString = (str) => str !== undefined && str !== null ? String(str).trim().toLowerCase() : "";

                const departurePlace = normalizeString(req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? value['Departure Zipcode'] : value['Departure place']);
                const arrivalPlace = normalizeString(req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? value['Arrival Zipcode'] : value['Arrival place']);
                const vehicleType = normalizeString(value['Vehicle type']);
                
                return {
                    updateOne: {
                        filter: { 
                            user_id: req.userId,
                            departure_place: departurePlace,
                            arrival_place: arrivalPlace,
                            number_of_person: value['Number of persons'],
                            vehicle_type: vehicleType,
                            price_type: req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? constant.UPLOADED_PRICE_TYPE.ZIP_CODE : constant.UPLOADED_PRICE_TYPE.ADDRESS
                        },
                        update: {
                            $set: {
                                user_id: req.userId,
                                departure_place: departurePlace,
                                arrival_place: arrivalPlace,
                                number_of_person: value['Number of persons'],
                                amount: value['Amount'],
                                vehicle_type: vehicleType,
                                price_type: req.body.upload_price_type == constant.UPLOADED_PRICE_TYPE.ZIP_CODE ? constant.UPLOADED_PRICE_TYPE.ZIP_CODE : constant.UPLOADED_PRICE_TYPE.ADDRESS
                            }
                        },
                        upsert: true, // Insert if not exists, update if exists
                        collation: { locale: "en", strength: 2 } // Case-insensitive matching
                    }
                };
            });
           
            await PRICE_MODEL.bulkWrite(bulkOps);
           

            return res.json({
                code: constant.success_code,
                message: res.__("priceUpload.success.fileProcessed")
            });
        });
        
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.getUploadedPrice = async (req, res) => {

    try {

        let data = req.body;
        let page = parseInt(data.page) || 1; // Current page number, default to 1
        let limit = parseInt(data.limit) || 10; // Number of results per page, default to 10
        let skip = (page - 1) * limit;
        let search = data.search ? data.search.trim() : "";
        let searchQuery = { user_id: req.userId  , price_type: data?.upload_price_type};

        if (search) {
            searchQuery.$or = [
                { departure_place: { $regex: search, $options: "i" } }, // Case-insensitive search
                { arrival_place: { $regex: search, $options: "i" } },
                { vehicle_type: { $regex: search, $options: "i" } },
            ];
        }

        // If the search term is a valid number, add conditions for number fields
        if (!isNaN(search) && !search == '') {
            searchQuery.$or.push(
                { number_of_person: search }, // Exact match for number
                { amount: search } // Exact match for amount
            );
        }

        const totalCount = await PRICE_MODEL.countDocuments(searchQuery);
        
        const allPriceList = await PRICE_MODEL.find(searchQuery).skip(skip).limit(limit).sort({ departure_place: 1 });
        return  res.send({
            code: constant.success_code,
            allPriceList: allPriceList,
            currentPage: page,
            totalPages: Math.ceil(totalCount / limit),
            totalItems: totalCount
            
        });
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
    
}

exports.deleteUploadedPrice = async (req, res) => {
    try {

        let data = req.body;
        let searchQuery = { user_id: req.userId  , price_type: data?.upload_price_type};
        await PRICE_MODEL.deleteMany(searchQuery);
        return  res.send({
            code: constant.success_code,
            message: res.__("priceUpload.success.priceDeleted")
            
        });
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.disabledUploadedPrices = async (req, res) => {
    try {

        let data = req.body;
        
        const isUpdateData = await PRICE_MODEL.updateMany(
                                                            { user_id: req.userId , price_type: data?.upload_price_type}, // Filter condition
                                                            { $set: {status: data.status  } } // Fields to update
                                                        );
        return  res.send({
            code: constant.success_code,
            message: res.__("priceUpload.success.priceUpdated")
            
        });
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.getAllUploadedPrice = async (req, res) => {

    try {

        let searchQuery = { user_id: req.userId ,  status: true};

        const allPriceList = await PRICE_MODEL.find(searchQuery);
        return  res.send({
                            code: constant.success_code,
                            allPriceList: allPriceList,
                        });
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
    
}


exports.getAllUploadedPriceForHotel = async (req, res) => {

    try {
        const companyId = req.params.id;
        let searchQuery = { user_id: companyId ,  status: true};

        const allPriceList = await PRICE_MODEL.find(searchQuery);
        return  res.send({
                            code: constant.success_code,
                            allPriceList: allPriceList,
                        });
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
    
}

exports.getAccessAllUploadedPrice = async (req, res) => {

    try {
        const id = req.params.id
        let searchQuery = { user_id: id ,  status: true};

        const allPriceList = await PRICE_MODEL.find(searchQuery);
        return  res.send({
                            code: constant.success_code,
                            allPriceList: allPriceList,
                        });
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
    
}

exports.upateUploadedPrice = async (req, res) => {

    try {

        if (req.user.role == constant.ROLES.COMPANY) {

            let data = req.body;
            const id = req.params.id;
            const uploadedPriceId = await PRICE_MODEL.findOne({_id: id , user_id: req.userId});
            let message = ``;
            if (uploadedPriceId) {

                let updateData = {}

                if ('amount' in data) {

                    updateData.amount = data?.amount;
                    message = res.__("priceUpload.success.priceUpdated");
                }

                if ('status' in data) {

                    updateData.status = data.status;
                    message = res.__("priceUpload.success.statusUpdated");
                }

                if ('visible_to_hotel' in data) {

                    updateData.visible_to_hotel = data.visible_to_hotel;
                    message = res.__("priceUpload.success.visibilityUpdated");
                }
                
                const isUpdateData = await PRICE_MODEL.updateOne(
                                                                    { _id: id }, // Filter condition
                                                                    { $set: updateData } // Fields to update
                                                                );
                return  res.send({
                                    code: constant.success_code,
                                    message: message,
                                });
                
                
            } else {

                return  res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.noPricefound")
                                });
            }
        } else {
            return res.send({
                code: constant.error_code,
                message: res.__("priceUpload.error.accessDenied")
            });
        }
        
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
}

exports.updateAllPriceVisibility = async (req, res) => {

    try {


        let data = req.body;

        if ('visible_to_hotel' in data  && 'upload_price_type' in data?.upload_price_type) {

            const uploadedPrice = await PRICE_MODEL.find({ user_id: req.userId , price_type: data?.upload_price_type});
           
            if (uploadedPrice) {

                let updateData =  {visible_to_hotel : data.visible_to_hotel };
                
                const isUpdateData = await PRICE_MODEL.updateMany(
                                                                    { user_id: req.userId  , price_type: data?.upload_price_type}, // Filter condition
                                                                    { $set: updateData } // Fields to update
                                                                );
                return  res.send({
                                    code: constant.success_code,
                                    message: res.__("priceUpload.success.visibilityUpdated"),
                                });
            } else {

                return  res.send({
                                    code: constant.error_code,
                                    message: res.__("priceUpload.error.noPricefound")
                                });
            }
        } else {
            return  res.send({
                                code: constant.error_code,
                                message: res.__("priceUpload.error.badRequest")
                            });
        }
        
        
        
    } catch (error) {
        console.error('Error getUploadedPrice:', error.message);
        return  res.send({
                            code: constant.error_code,
                            message: error.message,
                        });
    }
}