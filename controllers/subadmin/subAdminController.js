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
                message:  res.__("addDriver.error.emailAlreadyInUse")
            })
            return;
        }
        let checkPhone = await USER.findOne({ phone: data.phone })
        if (checkPhone) {
            res.send({
                code: constant.error_code,
                message: res.__("addDriver.error.phoneAlreadyInUse")
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
                message: res.__("addDriver.error.saveFailed")
            })
        } else {
            let jwtToken = jwt.sign({ userId: save_data._id, email: save_data.email, role: save_data.role }, process.env.JWTSECRET, { expiresIn: '365d' })
            res.send({
                code: constant.success_code,
                message: res.__("addSubAdmin.success.subAdminAdded"),
                result: save_data,
                jwtToken: jwtToken
            })
        }

    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error add sub admin:', err.message);
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
                message: res.__("addSubAdmin.error.noUserFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("addSubAdmin.success.companyListRetrieved"),
                result: get_data
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get subadmins:', err.message);
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
                message: res.__("addSubAdmin.error.noUserFound")
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__("addSubAdmin.success.infoRetrievedSuccess"),
                result: check_detail
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error get subadmin details', err.message);
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
                message: res.__("addSubAdmin.error.invalidData")
            })
            return;
        }
        let update_data = await USER.findOneAndUpdate(criteria,data,option)
        if(!update_data){
            res.send({
                code:constant.error_code,
                message: res.__("addSubAdmin.error.unableToupdate")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("addSubAdmin.success.subAdminUpdated"),
                result:update_data
            })
        }
    } catch (err) {

        console.log('❌❌❌❌❌❌❌❌❌Error edit subadmin details:', err.message);
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
                message: res.__("addSubAdmin.error.subadminDeleteError")
            })
        }else{
            res.send({
                code:constant.success_code,
                message: res.__("addSubAdmin.success.subAdminAccountDeleted")
            })
        }

    }catch(err){
        
        console.log('❌❌❌❌❌❌❌❌❌Error delete sub admin:', err.message);
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}
