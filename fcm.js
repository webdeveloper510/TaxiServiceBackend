const { default: axios } = require("axios");
const fcm = require("./config/fcm");
require("dotenv").config()

async function run (){
    try {
            // fcm.send({
            //     // to: user?.created_by?.deviceToken,
            //     to: "fivf_EWrTuCZ_dc7Plsq24:APA91bEqNEIxQSKdvS_-vUndzs4z_MPdhsSnE6J3dkWzzgGo727Agf0onsnqTxXt7-Qj_-zEAhZcRV9cwPQEEWsGyeBHdCpTEcT0YYoTlhNRrbTISWm_T5563wbTZCaXU6K7h_X42BJa",
            //     data: {
            //         message: "Trip canceled by driver",
            //         title:"tripCancelByDriver",
            //         // trip,
            //         // driver:driverBySocketId
            //     }}, function (err, response) {
            //     if (err) {
            //         console.log("Something has gone wrong!");
            //         throw err;
            //     } else {
            //             console.log("else=====>")
            //     }
            // });
           axios.post("https://fcm.googleapis.com/fcm/send", {
          // to: user?.created_by?.deviceToken,
          to: "ezVMWC7fRyuagt80mpxaCJ:APA91bHU4z2B1xRiddGSy9t_QS6B5R48RGDZVvR_AgBX3nwQdGhEaqrWIyHxe9WQEeyVSgLMtMRQ7FTdaAILt2OaNVJyMlCZQZ0EWKVpiW_NGWwdCc5AmFSPj4cmrXfNvR3Haw7oJJMq",
          notification: {
              message: "Trip canceled by driver",
              title:"tripCancelByDriver",
            //   trip,
            //   driver:driverBySocketId
          },
          

      }, { headers:{
        'Content-Type': 'application/json',
        'Authorization': 'key=AAAA5Uq9q94:APA91bEPptTBZy4qzvYRmUIZYpD3mwX2Md08agoS7Tza4CjCPpSTVcXwQVe3MT_lGUDih4vwqaAhNiq3cWVhi_UudW0nunPFfVMPr6POmki0uCa5I2xa-Xzd3X91Z1O4qRwXIM0A7WN9'
    } }).then((response)=>{

        console.log("🚀 ~ run ~ response:", response.data)
    }).catch(err=>{throw err})
           
    } catch (error) {
        console.log("🚀 ~ run ~ error:", error)
        
    }
}
run()