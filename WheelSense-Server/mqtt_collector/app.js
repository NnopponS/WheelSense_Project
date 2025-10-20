const mqtt = require("mqtt");
const { MongoClient } = require("mongodb");

const MQTT_TOPIC = "IoTProject/data";
const MQTT_URL = process.env.MQTT_BROKER || "mqtt://mosquitto:1883";
const MONGO_URL =
  process.env.MONGO_URL || process.env.MONGO_HOST || "mongodb://root:1234@mongodb:27017/";
const MONGO_DB = process.env.MONGO_DB || "iot_log";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "sensor_data";

const mqttClient = mqtt.connect(MQTT_URL, {
  reconnectPeriod: 2000,
});
const mongoClient = new MongoClient(MONGO_URL);
let collectionPromise;

function safeNumber(value) {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function buildDocument(payload) {
  const receivedAt = new Date();
  const doc = {
    dev_id: payload.dev_id ? String(payload.dev_id) : undefined,
    temperature: safeNumber(payload.temperature),
    humidity: safeNumber(payload.humidity),
    pressure: safeNumber(payload.pressure),
    device_timestamp_ms:
      typeof payload.timestamp === "number" && Number.isFinite(payload.timestamp)
        ? payload.timestamp
        : undefined,
    received_at: receivedAt,
    timestamp: receivedAt,
    raw: payload,
  };

  if (doc.dev_id) {
    const numeric = Number(doc.dev_id);
    if (Number.isFinite(numeric)) {
      doc.dev_id_num = numeric;
    }
  }

  return doc;
}

async function getCollection() {
  if (!collectionPromise) {
    collectionPromise = mongoClient
      .connect()
      .then(() => mongoClient.db(MONGO_DB).collection(MONGO_COLLECTION))
      .catch((error) => {
        console.error("Failed to connect to MongoDB", error);
        collectionPromise = undefined;
        throw error;
      });
  }

  return collectionPromise;
}

function ensureMongoConnection() {
  getCollection()
    .then(() => {
      console.log(`Connected to MongoDB at ${MONGO_URL}`);
    })
    .catch((error) => {
      console.error("Unable to establish MongoDB connection", error);
      setTimeout(ensureMongoConnection, 5000);
    });
}

mqttClient.on("connect", () => {
  console.log(`Connected to MQTT broker at ${MQTT_URL}`);
  mqttClient.subscribe(MQTT_TOPIC, { qos: 1 }, (err) => {
    if (err) {
      console.error(`Failed to subscribe to ${MQTT_TOPIC}`, err);
    } else {
      console.log(`Subscribed to MQTT topic ${MQTT_TOPIC}`);
    }
  });
});

mqttClient.on("reconnect", () => {
  console.log("Reconnecting to MQTT broker...");
});

mqttClient.on("error", (error) => {
  console.error("MQTT error", error);
});

mqttClient.on("message", async (_topic, message) => {
  let payload;
  try {
    payload = JSON.parse(message.toString());
  } catch (error) {
    console.error("Failed to parse MQTT payload as JSON", error);
    return;
  }

  try {
    const document = buildDocument(payload);
    const collection = await getCollection();
    await collection.insertOne(document);
    console.log(
      `Stored reading for ${document.dev_id ?? "unknown device"} at ${document.timestamp.toISOString()}`
    );
  } catch (error) {
    console.error("Failed to persist MQTT payload", error);
  }
});

ensureMongoConnection();
