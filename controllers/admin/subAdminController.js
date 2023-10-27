const USER = require('../../models/user/user_model')
const AGENCY = require('../../models/user/agency_model')
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const constant = require('../../config/constant');
const randToken = require('rand-token').generator()
const mongoose = require('mongoose')
require('dotenv').config();

exports.add_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let checkEmail = await USER.findOne({ email: data.email })
        if (checkEmail) {
            res.send({
                code: constant.error_code,
                message: "Email is already registered"
            })
            return;
        }
        let checkPhone = await USER.findOne({ phone: data.phone })
        if (checkPhone) {
            res.send({
                code: constant.error_code,
                message: "Phone is already exist"
            })
            return;
        }
        let hashedPassword = await bcrypt.hashSync(data.password ? data.password : "Test@123", 10);
        data.password = hashedPassword
        data.company_id = randToken.generate(4, '1234567890abcdefghijklmnopqrstuvxyz')
        data.company_id = data.first_name + '-' + data.company_id

        data.role = 'SUB_ADMIN'
        data.created_by = req.userId
        let save_data = await USER(data).save()
        if (!save_data) {
            res.send({
                code: constant.error_code,
                message: 'Something went wrong'
            })
        } else {
            let jwtToken = jwt.sign({ userId: save_data._id, email: save_data.email, role: save_data.role }, process.env.JWTSECRET, { expiresIn: '365d' })
            data.user_id = save_data._id
            let save_meta_data = await AGENCY(data).save()
            save_data.meta = save_meta_data
            res.send({
                code: constant.success_code,
                message: 'Sub admin added successfully',
                result: save_data,
                jwtToken: jwtToken
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_sub_admins = async (req, res) => {
    try {
        let data = req.body
        let get_data = await USER.aggregate([
            {
                $match: { role: 'SUB_ADMIN',is_deleted:false }

            },
            // {
            //     $lookup:{
            //         from:"agencies",
            //         localField:"_id",
            //         foreignField:"user_id",
            //     }
            // }
        ]).sort({ 'createdAt': -1 });
        if (!get_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the data"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: get_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.get_sub_admin_detail = async (req, res) => {
    try {
        let data = req.params
        let check_detail = await USER.aggregate([
            {
                $match: {
                    _id: new mongoose.Types.ObjectId(data.userId),
                }
            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "meta"
                }
            },
            {
                $project:{
                    _id:1,
                    first_name:1,
                    last_name:1,
                    email:1,
                    company_id:1,
                    company_name:1,
                    phone:1,
                    profile_image:1,
                    role:1,
                    status:1,
                    'land': { $arrayElemAt: ["$meta.land", 0] },
                    'post_code': { $arrayElemAt: ["$meta.post_code", 0] },
                    'house_number': { $arrayElemAt: ["$meta.house_number", 0] },
                    'description': { $arrayElemAt: ["$meta.description", 0] },
                    'affiliated_with': { $arrayElemAt: ["$meta.affiliated_with", 0] },
                    'p_number': { $arrayElemAt: ["$meta.p_number", 0] },
                    'number_of_cars': { $arrayElemAt: ["$meta.number_of_cars", 0] },
                    'chamber_of_commerce_number': { $arrayElemAt: ["$meta.chamber_of_commerce_number", 0] },
                    'vat_number': { $arrayElemAt: ["$meta.vat_number", 0] },
                    'website': { $arrayElemAt: ["$meta.website", 0] },
                    'tx_quality_mark': { $arrayElemAt: ["$meta.tx_quality_mark", 0] },
                    'saluation': { $arrayElemAt: ["$meta.saluation", 0] },
                    'location': { $arrayElemAt: ["$meta.location", 0] }
                }
            }

        ])
        if (check_detail.length == 0) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: check_detail[0]
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.edit_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let checkSubAdmin = await USER.findOne(criteria)
        if (!checkSubAdmin) {
            res.send({
                code: constant.error_code,
                message: "Invalid ID"
            })
            return;
        }
        let update_data = await USER.findOneAndUpdate(criteria, data, option)
        if (!update_data) {
            res.send({
                code: constant.error_code,
                message: "Unable to update the data"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Updated Successfull",
                result: update_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.delete_sub_admin = async (req, res) => {
    try {
        let data = req.body
        let criteria = { _id: req.params.id }
        let option = { new: true }
        let newValue = {
            $set: {
                is_deleted: true,
                deleted_by_id: req.userId
            }
        }
        let deleteSubAdmin = await USER.findOneAndUpdate(criteria, newValue, option)
        if (!deleteSubAdmin) {
            res.send({
                code: constant.error_code,
                message: "Unable to delete the sub admin"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Deleted"
            })
        }

    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}
