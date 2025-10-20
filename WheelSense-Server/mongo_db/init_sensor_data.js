db = db.getSiblingDB("iot_log");

const sensorData = [];
for (let address = 401; address <= 422; address++) {
  sensorData.push({
    dev_id: address,
    timestamp: new Date(),
    temp: 20 + (address - 401) * 0.5,
    humid: 45 + (address - 401) * 0.3,
    pressure: 1005 + (address - 401),
    address: address
  });
}

db.sensor_data.insertMany(sensorData);
