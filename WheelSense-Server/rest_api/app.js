const express = require("express");
const { MongoClient } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGO_URL = process.env.MONGO_URL || "mongodb://root:1234@mongodb:27017/";
const MONGO_DB = process.env.MONGO_DB || "iot_log";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "sensor_data";

const app = express();
const client = new MongoClient(MONGO_URL);
let sensorCollection;

app.get("/sensor-data", async (req, res) => {
  if (!sensorCollection) {
    return res.status(503).json({ error: "Database connection not ready" });
  }

  const devIdRaw = req.query.dev_id;
  let filter = {};
  if (devIdRaw !== undefined) {
    if (typeof devIdRaw !== "string") {
      return res.status(400).json({ error: "dev_id must be a string" });
    }

    const trimmed = devIdRaw.trim();
    if (trimmed.length === 0) {
      return res.status(400).json({ error: "dev_id must not be empty" });
    }

    const numeric = Number(trimmed);
    if (Number.isFinite(numeric)) {
      filter = {
        $or: [{ dev_id: trimmed }, { dev_id_num: numeric }],
      };
    } else {
      filter = { dev_id: trimmed };
    }
  }

  try {
    const docs = await sensorCollection.find(filter).toArray();
    return res.json({
      filter: devIdRaw !== undefined ? filter : "all",
      count: docs.length,
      data: docs,
    });
  } catch (error) {
    console.error("Failed to query sensor data", error);
    return res.status(500).json({ error: "Failed to fetch sensor data" });
  }
});

app.get("/health", (req, res) => {
  if (sensorCollection) {
    return res.json({ status: "ok" });
  }
  return res.status(503).json({ status: "initializing" });
});

async function start() {
  try {
    await client.connect();
    const database = client.db(MONGO_DB);
    sensorCollection = database.collection(MONGO_COLLECTION);
    app.listen(PORT, () => {
      console.log(`REST API listening on port ${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start REST API", error);
    process.exit(1);
  }
}

start();
