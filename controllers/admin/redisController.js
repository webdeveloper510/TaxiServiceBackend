const { redis , sub }= require("../../utils/redis");
const CONSTANT = require("../../config/constant");
exports.checkRedisMemory = async (req, res) => {
    try {

        const memoryInfo = await redis.info("memory");

        // Parse memory info
        const usedMemoryMatch = memoryInfo.match(/used_memory:(\d+)/);
        const usedMemory = usedMemoryMatch ? parseInt(usedMemoryMatch[1]) : 0;

        const totalSystemMemoryMatch = memoryInfo.match(/total_system_memory:(\d+)/);
        const totalSystemMemory = totalSystemMemoryMatch ? parseInt(totalSystemMemoryMatch[1]) : 0;

        const usedMB = (usedMemory / 1024 / 1024).toFixed(2);
        const totalMB = totalSystemMemory ? (totalSystemMemory / 1024 / 1024).toFixed(2) : "N/A";
        const usagePercent = totalSystemMemory ? ((usedMemory / totalSystemMemory) * 100).toFixed(2) : "N/A";

        console.log(
        `[${new Date().toLocaleString()}] Redis Memory: ${usedMB} MB / ${totalMB} MB (${usagePercent}%)`
        );


        res.send({
          code: CONSTANT.success_code,
          message: `[${new Date().toLocaleString()}] Redis Memory: ${usedMB} MB / ${totalMB} MB (${usagePercent}%)`,
        });

    } catch (err) {
      console.log( "❌❌❌❌❌❌❌❌❌🚀 ~redis check memory ~ err:", err.message );
        res.send({
          code: CONSTANT.error_code,
          message: err.message,
        });
      }
}