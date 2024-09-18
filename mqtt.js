const mqtt = require("mqtt");
const mysql = require("mysql2/promise");
const line = require("./line");

const client = mqtt.connect("mqtt://localhost:1883");
const topic = "#";

let conn = null;

const initMySQL = async () => {
    conn = await mysql.createConnection({
        host: "localhost",
        user: "root",
        password: "TestOne",
        database: "device_manager",
    });
};

client.on("connect", async () => {
    await initMySQL();
    console.log("Connected to broker.");
    client.subscribe(topic, (err) => {
        if (!err) {
            console.log(`Subscribed to topic: ${topic}`);
        } else {
            console.error(`Failed to subscribe: ${err}`);
        }
    });
});

// When a message is received on the subscribed topic
client.on("message", async (topic, message) => {
    // message is a Buffer, so convert it to a string
    console.log(`Received message on topic ${topic}: ${message.toString()}`);
    const deviceName = topic.split("/")[0];
    const type = topic.split("/")[1];
    if (type == "Status") {
        const MAC = message.toString().split(" ")[1].slice(4, 21);
        setMAC(deviceName, MAC);
    } else if (type == "DI") {
        let IOStatus = "";
        const io = message.toString().slice(3, 7);
        for (let i = 0; i < io.length; i++) {
            if (io[i] == "0") {
                IOStatus += "1";
            } else {
                IOStatus += "0";
            }
        }
        setIO(deviceName, IOStatus);
    }
});

// Error handling
client.on("error", (err) => {
    console.error(`Connection error: ${err}`);
});

const setIO = async (deviceName, IOStatus) => {
    [response] = await conn.query(`SELECT MAC FROM devices_status WHERE DeviceName = "${deviceName}"`);
    if (response.length != 0) {
        await conn.query(`UPDATE devices_status SET Status = ${1}, IOStatus = "${IOStatus}", LastestTime = NOW()
        WHERE DeviceName = '${deviceName}'`);
        await checkIO(response[0].MAC, IOStatus);
    }
};

const setMAC = async (deviceName, MAC) => {
    [response] = await conn.query(`SELECT DeviceName FROM devices_status WHERE DeviceName = "${deviceName}"`);
    if (response.length == 0) {
        await conn.query("INSERT INTO devices_status (DeviceName, MAC) VALUES (?,?,?)", [deviceName, MAC]);
    } else {
        await conn.query("UPDATE devices_status SET MAC = ? WHERE DeviceName = ?", [MAC, deviceName]);
    }
};

const checkIO = async (MAC, IOStatus) => {
    [response] = await conn.query("SELECT AlertStatus, AlertMessage, UserID FROM devices_alert WHERE MAC = ?", MAC);
    response.forEach(async (alert) => {
        if (alert.AlertStatus == IOStatus) {
            [res] = await conn.query("SELECT LineToken FROM users WHERE ID = ?", alert.UserID);
            line.callLineApi(res[0].LineToken, alert.AlertMessage);
        }
    });
};

const CHECK_INTERVAL = 10000; // Check every 10 seconds
const DISCONNECT_THRESHOLD = 120000; // 2 minute in milliseconds

setInterval(async () => {
    const currentTime = new Date();

    const [results] = await conn.query("SELECT Status, StatusID, LastestTime FROM devices_status");

    results.forEach(async (status) => {
        const timeDifference = currentTime - new Date(status.LastestTime);
        if (timeDifference > DISCONNECT_THRESHOLD) {
            await conn.query("UPDATE devices_status SET Status = 0 WHERE StatusID = ?", status.StatusID);
        } else {
            await conn.query("UPDATE devices_status SET Status = 1 WHERE StatusID = ?", status.StatusID);
        }
    });
}, CHECK_INTERVAL);
