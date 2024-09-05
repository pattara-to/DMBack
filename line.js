const request = require("request");
const dotenv = require("dotenv");
dotenv.config();

const url_line_notification = "https://notify-api.line.me/api/notify";

module.exports = {
    callLineApi: function (token, message) {
        request(
            {
                method: "POST",
                uri: url_line_notification,
                header: {
                    "Content-Type": "multipart/form-data",
                },
                auth: {
                    bearer: token,
                },
                form: {
                    message: message,
                },
            },
            (err, httpResponse, body) => {
                if (err) {
                    console.log(err);
                } else {
                    console.log(body);
                }
            }
        );
    },
};
