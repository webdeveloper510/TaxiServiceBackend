const USER = require('../../models/user/user_model')
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const constant = require('../../config/constant');
require('dotenv').config();

exports.add_sub_admin = async(req,res) =>{
    try{
        let data = req.body
        let checkEmail = await USER.findOne({email:data.email})
        if(checkEmail){
            res.send({
                code:constant.error_code,
                message:"Email is already registered"
            })
        }
    }catch(err){
        res.send({
            code:constant.error_code,
            message:err.message
        })
    }
}
