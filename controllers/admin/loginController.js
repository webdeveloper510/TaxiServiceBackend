require("dotenv").config()
const  constants  = require('../../config/constant')
const USER = require('../../models/user/user_model')
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const multer = require('multer')
const path = require('path')

exports.create_super_admin = async(req,res)=>{
    try{
        let data = req.body
        let checkEmail = await USER.findOne({email:data.email})
        if(checkEmail){
            res.send({
                code:constants.error_code,
                message:"Email is already exist!"
            })
            return;
        }
        let checkPhone = await USER.findOne({phone:data.phone})
        if(checkPhone){
            res.send({
                code:constants.error_code,
                message:"Phone number is already exist"
            })
            return;
        }
        let hash = await bcrypt.hashSync(data.password,10)
        data.password = hash
        let save_data = await USER(data).save()
        if(!save_data){
            res.send({
                code:constants.error_code,
                message:"Unable to save the data"
            })
        }else{
            let jwtToken = jwt.sign({userId:save_data._id},process.env.JWTSECRET,{expiresIn:'365d'})
            save_data.jwtToken = jwtToken
            res.send({
                code:constants.success_code,
                message:"Successfully created",
                result:save_data
            })
        }
    }catch(err){
        res.send({
            code:constants.error_code,
            message:err.message
        })
    }
}

exports.login = async(req,res)=>{
    try{
        let data = req.body
        let userData = await USER.findOne({
            $or:[{'email':data.email},{'phone':data.email}]
        })
        if(!userData){
            res.send({
                code:constants.error_code,
                message:"Invalid Credentials"
            })
            return;
        }
        let checkPassword = await bcrypt.compare(data.password,userData.password)
        if(!checkPassword){
            res.send({
                code:constants.error_code,
                message:"Invalid Credentials"
            })
            return;
        }
        let jwtToken = jwt.sign({userId:userData._id},process.env.JWTSECRET,{expiresIn:'365d'})
        userData.jwtToken = jwtToken
        res.send({
            code:constants.success_code,
            message:"Login Successful",
            result:userData
        })
        // let userData = await USER.findOne({email:data.email}).select("+password")
    }catch(err){
        res.send({
            code:constants.error_code,
            message:err.message
        })
    }
}

