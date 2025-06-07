
const AGENCY = require('../../models/user/agency_model')
const constant = require('../../config/constant')

exports.add_agency = async (req, res) => {
    try {
        let data = req.body
        data.user_id = data.agency_id
        let save_agency = await AGENCY(data).save()
        if (!save_agency) {
            res.send({
                code: constant.error_code,
                message: res.__('addAgency.error.unableToSaveData')
            })
        } else {
            res.send({
                code: constant.success_code,
                message: res.__('addAgency.success.dataSaved'),
                result: save_agency
            })
        }
    } catch (err) {
        res.send({
            code: constant.error_code,
            message: err.message
        })
    }
}




