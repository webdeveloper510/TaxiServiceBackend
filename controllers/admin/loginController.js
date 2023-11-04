require("dotenv").config()
const constants = require('../../config/constant')
const USER = require('../../models/user/user_model')
const AGENCY = require('../../models/user/agency_model')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')
const constant = require("../../config/constant")
const mongoose = require("mongoose")

exports.create_super_admin = async (req, res) => {
    try {
        let data = req.body
        let checkEmail = await USER.findOne({ email: data.email })
        if (checkEmail) {
            res.send({
                code: constants.error_code,
                message: "Email is already exist!"
            })
            return;
        }
        let checkPhone = await USER.findOne({ phone: data.phone })
        if (checkPhone) {
            res.send({
                code: constants.error_code,
                message: "Phone number is already exist"
            })
            return;
        }
        let hash = await bcrypt.hashSync(data.password, 10)
        data.password = hash
        let save_data = await USER(data).save()
        if (!save_data) {
            res.send({
                code: constants.error_code,
                message: "Unable to save the data"
            })
        } else {
            let jwtToken = jwt.sign({ userId: save_data._id }, process.env.JWTSECRET, { expiresIn: '365d' })
            save_data.jwtToken = jwtToken
            res.send({
                code: constants.success_code,
                message: "Successfully created",
                result: save_data
            })
        }
    } catch (err) {
        res.send({
            code: constants.error_code,
            message: err.message
        })
    }
}

exports.login = async (req, res) => {
    try {
        let data = req.body
        let userData = await USER.findOne(
            {
                $and: [
                    {
                        $or: [{ 'email': data.email }, { 'phone': data.email }]
                    },
                    {
                        status: true
                    },
                    {
                        is_deleted: false
                    }
                ]
            }
        )
        if (!userData) {
            res.send({
                code: constants.error_code,
                message: "Invalid Credentials"
            })
            return;
        }
        let checkPassword = await bcrypt.compare(data.password, userData.password)
        if (!checkPassword) {
            res.send({
                code: constants.error_code,
                message: "Invalid Credentials"
            })
            return;
        }
        let jwtToken = jwt.sign({ userId: userData._id }, process.env.JWTSECRET, { expiresIn: '365d' })
        let getData = await USER.aggregate([
            {
                $match: { _id: new mongoose.Types.ObjectId(userData._id) }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "company_detail"
                }
            },
            { $unwind: "$company_detail" }
        ])
        console.log(getData)
        res.send({
            code: constants.success_code,
            message: "Login Successful",
            result: getData[0] ? getData[0]:userData,
            jwtToken: jwtToken
        })
    } catch (err) {
        res.send({
            code: constants.error_code,
            message: err.message
        })
    }
}

exports.get_token_detail = async (req, res) => {
    try {
        let data = req.body
        const userByID = await USER.findOne({_id:req.userId})
        let getData = await USER.aggregate([
            {
                $match: { _id: new mongoose.Types.ObjectId(req.userId) }

            },
            {
                $lookup: {
                    from: "agencies",
                    localField: "_id",
                    foreignField: "user_id",
                    as: "company_detail"
                }
            },
            { $unwind: "$company_detail" }
        ])
        if (!userByID) {
            res.send({
                code: constants.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: getData[0] ? getData[0] : userByID
            })
        }
    } catch (err) {
        res.send({

            code: constants.error_code,
            message: err.message
        })
    }
}

