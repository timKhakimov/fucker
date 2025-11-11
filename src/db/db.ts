"use server";
import { MongoClient, Db, MongoClientOptions } from "mongodb";

let client: MongoClient | null = null;
let logsDatabase: Db | null = null;
let coreDatabase: Db | null = null;
let isInitializing = false;

const options: MongoClientOptions = {
  heartbeatFrequencyMS: 10000,
  serverSelectionTimeoutMS: 5000,
  connectTimeoutMS: 10000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
  minPoolSize: 1,
  retryWrites: true,
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function tryConnect(attempt: number = 1): Promise<void> {
  const maxDelay = 30000;
  const baseDelay = 1000;

  try {
    client = new MongoClient(
      String(
        "mongodb://core_f8a4c2e7:xK9mP2vL4wR7nQ3sT8jH6yF5aD1zX0bC@89.23.119.248:27018/core?authSource=admin"
      ),
      options
    );

    client.on("serverHeartbeatSucceeded", () => {
      console.log("MongoDB heartbeat succeeded");
    });

    client.on("serverHeartbeatFailed", (error) => {
      console.error("MongoDB heartbeat failed:", error);
    });

    client.on("connectionPoolCleared", () => {
      console.warn("MongoDB connection pool cleared");
    });

    await client.connect();
    logsDatabase = client.db("fucker_logs");
    coreDatabase = client.db("fucker");

    // Проверяем, что обе базы действительно доступны
    await Promise.all([
      client.db("fucker_logs").command({ ping: 1 }),
      client.db("fucker").command({ ping: 1 }),
    ]);

    console.log("MongoDB connection established successfully");
  } catch (error) {
    console.error(`Connection attempt ${attempt} failed:`, error);

    // Закрываем клиент перед повторной попыткой
    if (client) {
      await client.close().catch(() => {});
      client = null;
      logsDatabase = null;
      coreDatabase = null;
    }

    // Экспоненциальная задержка с ограничением
    const waitTime = Math.min(Math.pow(2, attempt) * baseDelay, maxDelay);
    console.log(`Retrying in ${waitTime / 1000} seconds...`);
    await delay(waitTime);

    // Рекурсивная попытка переподключения
    await tryConnect(attempt + 1);
  }
}

async function initializeConnection(): Promise<void> {
  if (isInitializing) {
    // Ждём, пока текущая инициализация завершится
    while (isInitializing) {
      await delay(100);
    }
    return;
  }

  if (!client || !logsDatabase || !coreDatabase) {
    try {
      isInitializing = true;
      await tryConnect();
    } finally {
      isInitializing = false;
    }
  }
}

async function ensureConnection(dbName: "fucker" | "fucker_logs"): Promise<Db> {
  while (true) {
    try {
      if (
        !client ||
        (!logsDatabase && dbName === "fucker_logs") ||
        (!coreDatabase && dbName === "fucker")
      ) {
        await initializeConnection();
      }

      // Проверяем, что клиент существует после инициализации
      if (!client) {
        throw new Error("Client initialization failed");
      }

      // Проверяем соединение для конкретной базы
      await client.db(dbName).command({ ping: 1 });

      return dbName === "fucker_logs" ? logsDatabase! : coreDatabase!;
    } catch (error) {
      console.error(`Lost connection to ${dbName} database:`, error);

      // Сбрасываем состояние перед повторной попыткой
      if (client) {
        await client.close().catch(() => {});
        client = null;
        logsDatabase = null;
        coreDatabase = null;
      }

      // Продолжаем попытки подключения
      await delay(1000);
    }
  }
}

export const logsDB = async (): Promise<Db> => {
  return ensureConnection("fucker_logs");
};

export const coreDB = async (): Promise<Db> => {
  return ensureConnection("fucker");
};
