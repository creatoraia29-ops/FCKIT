const { S3Client, PutObjectCommand, GetObjectCommand } = require("@aws-sdk/client-s3");
const path = require("path");
const fs = require("fs");

const ROOT = __dirname;
function loadEnv() {
  const file = path.join(ROOT, ".env");
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const split = trimmed.indexOf("=");
    if (split < 1) continue;
    const key = trimmed.slice(0, split).trim();
    let value = trimmed.slice(split + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}
loadEnv();

let s3Client = null;
const BUCKET_NAME = process.env.NEON_STORAGE_BUCKET || "uploads";

function isStorageConfigured() {
  return Boolean(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_ENDPOINT_URL_S3
  );
}

function getStorageClient() {
  if (!s3Client && isStorageConfigured()) {
    try {
      s3Client = new S3Client({
        region: process.env.AWS_REGION || "us-east-2",
        endpoint: process.env.AWS_ENDPOINT_URL_S3,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        },
        forcePathStyle: true,
      });
    } catch (err) {
      console.error("Ошибка инициализации Neon Object Storage клиента:", err.message);
    }
  }
  return s3Client;
}

/**
 * Загрузить файл в Neon Object Storage
 * @param {string} key Путь / имя файла в хранилище (например, "receipts/receipt-123.jpg")
 * @param {Buffer|string} body Содержимое файла
 * @param {string} contentType MIME-тип
 * @returns {Promise<boolean>}
 */
async function uploadToStorage(key, body, contentType = "application/octet-stream") {
  const client = getStorageClient();
  if (!client) return false;

  // Нормализуем ключ: убираем ведущие слэши
  const normalizedKey = key.replace(/^\/+/, "");

  try {
    await client.send(
      new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: normalizedKey,
        Body: body,
        ContentType: contentType,
      })
    );
    return true;
  } catch (err) {
    console.error(`Ошибка загрузки в Neon Object Storage (${normalizedKey}):`, err.message);
    return false;
  }
}

/**
 * Получить файл из Neon Object Storage
 * @param {string} key Путь / имя файла в хранилище
 * @returns {Promise<{ buffer: Buffer, contentType: string } | null>}
 */
async function downloadFromStorage(key) {
  const client = getStorageClient();
  if (!client) return null;

  const normalizedKey = key.replace(/^\/+/, "");

  try {
    const res = await client.send(
      new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: normalizedKey,
      })
    );
    const bytes = await res.Body.transformToByteArray();
    return {
      buffer: Buffer.from(bytes),
      contentType: res.ContentType || "application/octet-stream",
    };
  } catch (err) {
    // Если объект не найден
    return null;
  }
}

module.exports = {
  BUCKET_NAME,
  isStorageConfigured,
  getStorageClient,
  uploadToStorage,
  downloadFromStorage,
};
