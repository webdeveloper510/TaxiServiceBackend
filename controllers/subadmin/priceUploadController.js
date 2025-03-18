
const USER = require('../../models/user/user_model')
const PRICE_MODEL = require('../../models/user/price_model')
const constant = require('../../config/constant')
const multer = require("multer");
const xlsx = require("xlsx");
// Multer setup (Store file in memory, not disk)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage }).single("file");

exports.priceUploadController = async (req, res) => {
    try {

        upload(req, res, async function (err) {
            if (err) {
                return res.send({
                                    code: constant.error_code,
                                    message: `File upoaded failed`,
                                });
            }

            if (!req.user.role == constant.ROLES.COMPANY) {

                return res.send({
                                    code: constant.error_code,
                                    message: `You are not allowed to performed this action`,
                                });
            }

            if (!req.file) {
                return res.send({
                                    code: constant.error_code,
                                    message: `No file upoad`,
                                });
            }

            const fileBuffer = req.file.buffer;
            const workbook = xlsx.read(fileBuffer, { type: "buffer" });

            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const jsonData = xlsx.utils.sheet_to_json(sheet);


            const bulkOps = jsonData.map(value => ({
                updateOne: {
                    filter: { 
                        user_id: req.userId,
                        departure_place: value['Departure place'],
                        arrival_place: value['Arrival place'],
                        number_of_person: value['Number of persons'],
                        vehicle_type: value['Vehicle type'],
                    },
                    update: {
                        $set: {
                            user_id: req.userId,
                            departure_place: value['Departure place'],
                            arrival_place: value['Arrival place'],
                            number_of_person: value['Number of persons'],
                            amount: value['Amount'],
                            vehicle_type: value['Vehicle type'],
                        }
                    },
                    upsert: true // Insert if not exists, update if exists
                }
            }));
            
            await PRICE_MODEL.bulkWrite(bulkOps);
           

            return res.json({
                code: constant.success_code,
                message: "File processed successfully",
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
        let searchQuery = { user_id: req.userId };

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

        const allPriceList = await PRICE_MODEL.find(searchQuery).skip(skip).limit(limit).sort({ _id: -1 });
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
            
            if (uploadedPriceId) {

                let updateData = {}

                if (data?.amount) updateData.amount = data?.amount;

                if (data?.status) updateData.status = data?.status;
                
                
                const isUpdateData = await PRICE_MODEL.updateOne(
                                                                    { _id: id }, // Filter condition
                                                                    { $set: updateData } // Fields to update
                                                                );
                return  res.send({
                                    code: constant.success_code,
                                    message: `Data updated successfuly`,
                                    });
                
                
            }else {

                return  res.send({
                                    code: constant.error_code,
                                    message: `Data not found`,
                                });
            }
        } else {
            return res.send({
                code: constant.error_code,
                message: `You are not allowed to performed this action`,
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
