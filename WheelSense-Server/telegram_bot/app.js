const TelegramBot = require("node-telegram-bot-api");
const { MongoClient } = require("mongodb");

const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
if (!BOT_TOKEN) {
  throw new Error("Environment variable TELEGRAM_BOT_TOKEN is required");
}

const MONGO_URL = process.env.MONGO_URL || "mongodb://root:1234@mongodb:27017/";
const MONGO_DB = process.env.MONGO_DB || "iot_log";
const MONGO_COLLECTION = process.env.MONGO_COLLECTION || "sensor_data";
const DEFAULT_DEVICE_ID = process.env.DEFAULT_DEVICE_ID || "esp32-sensor-13";
const TIMEZONE = process.env.DISPLAY_TIMEZONE || "Asia/Bangkok";

const bot = new TelegramBot(BOT_TOKEN, { polling: true });
const mongoClient = new MongoClient(MONGO_URL);
let collectionPromise;

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

function buildQuery(deviceId) {
  if (!deviceId) {
    return {};
  }

  const normalized = String(deviceId).trim();
  const numeric = Number(normalized);
  if (Number.isFinite(numeric)) {
    return {
      $or: [{ dev_id: normalized }, { dev_id_num: numeric }],
    };
  }

  return { dev_id: normalized };
}

function formatTemperature(record) {
  const lines = [];
  const deviceId = record.dev_id || record.raw?.dev_id || "unknown device";
  const temperature = record.temperature ?? record.raw?.temperature ?? record.temp;
  const humidity = record.humidity ?? record.raw?.humidity ?? record.humid;
  const pressure = record.pressure ?? record.raw?.pressure;
  const timestamp = record.timestamp || record.received_at;

  lines.push(`Device: ${deviceId}`);
  if (typeof temperature === "number") {
    lines.push(`Temperature: ${temperature.toFixed(2)} C`);
  }
  if (typeof humidity === "number") {
    lines.push(`Humidity: ${humidity.toFixed(2)} %`);
  }
  if (typeof pressure === "number") {
    lines.push(`Pressure: ${pressure.toFixed(2)} hPa`);
  }
  if (timestamp instanceof Date && !Number.isNaN(timestamp.getTime())) {
    lines.push(
      `Recorded at: ${timestamp.toLocaleString("th-TH", {
        timeZone: TIMEZONE,
      })}`
    );
  }

  return lines.join("\n");
}

async function replyWithLatestTemperature(chatId, deviceId) {
  try {
    const collection = await getCollection();
    const filter = buildQuery(deviceId);
    const record = await collection.findOne(filter, {
      sort: { timestamp: -1, received_at: -1 },
    });

    if (!record) {
      await bot.sendMessage(chatId, "No temperature data available yet.");
      return;
    }

    const message = formatTemperature(record);
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error("Failed to fetch temperature", error);
    await bot.sendMessage(chatId, "Failed to fetch data, please try again shortly.");
  }
}

function parseCommand(text) {
  const trimmed = text.trim();
  if (trimmed.toLowerCase() === "temp") {
    return { type: "temp", deviceId: DEFAULT_DEVICE_ID };
  }

  const match = /^temp\s+(.+)$/i.exec(trimmed);
  if (match) {
    return { type: "temp", deviceId: match[1].trim() };
  }

  if (/^\/start\b/i.test(trimmed)) {
    return { type: "start" };
  }

  return null;
}

bot.onText(/^\/start/i, async (msg) => {
  const chatId = msg.chat.id;
  await bot.sendMessage(
    chatId,
    'Send "temp" to see the latest reading or "temp <deviceId>" to target a specific device.'
  );
});

bot.on("message", async (msg) => {
  if (!msg.text) {
    return;
  }

  const command = parseCommand(msg.text);
  if (!command) {
    return;
  }

  if (command.type === "start") {
    return; // already handled by onText
  }

  if (command.type === "temp") {
    await replyWithLatestTemperature(msg.chat.id, command.deviceId);
  }
});

bot.on("polling_error", (error) => {
  console.error("Polling error", error);
});

process.on("SIGINT", async () => {
  console.log("Stopping Telegram bot...");
  bot.stopPolling();
  await mongoClient.close();
  process.exit(0);
});

console.log("Telegram bot started. Waiting for messages...");
