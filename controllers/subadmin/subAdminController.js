const USER = require('../../models/user/user_model')
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const constant = require('../../config/constant');
const randToken = require('rand-token').generate()
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
                message: "Phone Number is already exist"
            })
            return;
        }
        let hashedPassword = await bcrypt.hashSync(data.password, 10);
        data.password = hashedPassword
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
        let get_data = await USER.find({ role: 'SUB_ADMIN' })
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
        let check_detail = await USER.findOne({ _id: data.id })
        if (!check_detail) {
            res.send({
                code: constant.error_code,
                message: "Unable to fetch the detail"
            })
        } else {
            res.send({
                code: constant.success_code,
                message: "Success",
                result: check_detail
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
        let update_data = await USER.findOneAndUpdate(criteria,data,option)
        if(!update_data){
            res.send({
                code:constant.error_code,
                message:"Unable to update the data"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Updated successfull",
                result:update_data
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}

exports.delete_sub_admin = async(req,res)=>{
    try{
        let data = req.body
        let criteria = {_id:req.params.id}
        let option = {new:true}
        let newValue = {
            $set:{
                is_deleted:true,
                deleted_by_id:req.userId
            }
        }
        let deleteSubAdmin = await USER.findOneAndUpdate(criteria,newValue,option)
        if(!deleteSubAdmin){
            res.send({
                code:constant.error_code,
                message:"Unable to delete the sub admin"
            })
        }else{
            res.send({
                code:constant.success_code,
                message:"Deleted"
            })
        }

    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}
