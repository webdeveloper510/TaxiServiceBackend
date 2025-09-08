const cron = require("node-cron");
const { generateCompanyInvoices } = require("../Service/invoice.service");

exports.companyInvoicecreationCron = () =>  {
    cron.schedule("0 11 * * *", () => {
        console.log("Invoice cron running at 11 AM Netherlands time");
        generateCompanyInvoices();
    }, {
        timezone: "Europe/Amsterdam"
    });
}