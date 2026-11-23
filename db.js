let createClient;
try {
  createClient = require("@libsql/client/web").createClient;
} catch {
  createClient = require("@libsql/client").createClient;
}
const fs = require("fs");
const path = require("path");

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

let client = null;

function getClient() {
  if (!client && process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    try {
      client = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } catch (err) {
      console.error("Ошибка инициализации Turso клиента:", err.message);
    }
  }
  return client;
}

async function initTurso() {
  const db = getClient();
  if (!db) return false;

  try {
    await db.execute(`
      CREATE TABLE IF NOT EXISTS products (
        id INTEGER PRIMARY KEY,
        title TEXT NOT NULL,
        department TEXT,
        section TEXT,
        price INTEGER NOT NULL,
        sale INTEGER,
        image TEXT,
        shade TEXT,
        text TEXT,
        hit INTEGER DEFAULT 0,
        installmentMonths INTEGER DEFAULT 4,
        weightGram INTEGER,
        tiers TEXT,
        tagStyle TEXT
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY,
        createdAt TEXT,
        name TEXT,
        phone TEXT,
        note TEXT,
        items TEXT,
        total INTEGER,
        status TEXT DEFAULT 'new',
        paymentMethod TEXT DEFAULT 'card',
        paymentStatus TEXT DEFAULT 'pending',
        paymentDetails TEXT
      );
    `);
    // Миграции для существующих таблиц
    try { await db.execute("ALTER TABLE orders ADD COLUMN paymentMethod TEXT DEFAULT 'card'"); } catch (_) {}
    try { await db.execute("ALTER TABLE orders ADD COLUMN paymentStatus TEXT DEFAULT 'pending'"); } catch (_) {}
    try { await db.execute("ALTER TABLE orders ADD COLUMN paymentDetails TEXT"); } catch (_) {}
    try { await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (createdAt DESC)"); } catch (_) {}
    try { await db.execute("CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (phone)"); } catch (_) {}
    await db.execute(`
      CREATE TABLE IF NOT EXISTS promotions (
        id TEXT PRIMARY KEY,
        name TEXT,
        badgeText TEXT,
        discountType TEXT,
        discountValue REAL,
        startDate TEXT,
        endDate TEXT,
        target TEXT,
        active INTEGER DEFAULT 1
      );
    `);
    await db.execute(`
      CREATE TABLE IF NOT EXISTS telegram_authorized_users (
        id TEXT PRIMARY KEY,
        username TEXT,
        firstName TEXT,
        authorizedAt TEXT
      );
    `);

    // Если таблица товаров пуста, переносим существующие из products.json
    const existing = await db.execute("SELECT COUNT(*) AS count FROM products");
    const count = Number(existing.rows[0]?.count || 0);

    if (count === 0) {
      const pfile = path.join(ROOT, "products.json");
      if (fs.existsSync(pfile)) {
        const list = JSON.parse(fs.readFileSync(pfile, "utf8"));
        for (const item of list) {
          await db.execute({
            sql: `INSERT OR REPLACE INTO products (id, title, department, section, price, sale, image, shade, text, hit, installmentMonths, weightGram, tiers, tagStyle)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              item.id,
              item.title,
              item.department,
              item.section,
              item.price,
              item.sale || null,
              item.image || null,
              item.shade || null,
              item.text || null,
              item.hit ? 1 : 0,
              item.installmentMonths || 4,
              item.weightGram || null,
              item.tiers ? JSON.stringify(item.tiers) : null,
              item.tagStyle ? JSON.stringify(item.tagStyle) : null,
            ],
          });
        }
        console.log(`✅ В Turso перенесено ${list.length} товаров из локальной базы!`);
      }
    }

    console.log("✅ База данных Turso успешно подключена!");
    return true;
  } catch (err) {
    console.error("Ошибка подключения к Turso:", err.message);
    return false;
  }
}

let cachedProducts = null;
let cachedProductsExpiresAt = 0;
const PRODUCTS_CACHE_TTL_MS = 60 * 1000; // 60 секунд кэш в памяти

let cachedPromotions = null;
let cachedPromotionsExpiresAt = 0;
const PROMOTIONS_CACHE_TTL_MS = 60 * 1000;

async function dbGetProducts() {
  if (cachedProducts && Date.now() < cachedProductsExpiresAt) {
    return cachedProducts;
  }
  const db = getClient();
  if (db) {
    try {
      const res = await db.execute("SELECT * FROM products ORDER BY id ASC");
      if (res.rows.length) {
        const mapped = res.rows.map((row) => ({
          id: Number(row.id),
          title: row.title,
          department: row.department,
          section: row.section,
          price: Number(row.price),
          sale: row.sale ? Number(row.sale) : null,
          image: row.image,
          shade: row.shade,
          text: row.text,
          hit: Boolean(row.hit),
          installmentMonths: Number(row.installmentMonths || 4),
          weightGram: row.weightGram ? Number(row.weightGram) : null,
          tiers: row.tiers ? JSON.parse(row.tiers) : null,
          tagStyle: row.tagStyle ? JSON.parse(row.tagStyle) : null,
        }));
        cachedProducts = mapped;
        cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;
        return mapped;
      }
    } catch (e) {
      console.error("Turso read error:", e.message);
    }
  }
  const pfile = path.join(ROOT, "products.json");
  if (fs.existsSync(pfile)) {
    const fromJson = JSON.parse(fs.readFileSync(pfile, "utf8"));
    cachedProducts = fromJson;
    cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;
    return fromJson;
  }
  return [];
}

async function dbSaveProducts(list) {
  cachedProducts = Array.isArray(list) ? list : [];
  cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;

  try {
    const pfile = path.join(ROOT, "products.json");
    fs.writeFileSync(pfile, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    // Read-only filesystem on serverless platforms (Vercel)
  }

  const db = getClient();
  if (db) {
    try {
      if (typeof db.batch === "function") {
        const batchStmts = [
          { sql: "DELETE FROM products" },
          ...list.map((item) => ({
            sql: `INSERT OR REPLACE INTO products (id, title, department, section, price, sale, image, shade, text, hit, installmentMonths, weightGram, tiers, tagStyle)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              item.id,
              item.title,
              item.department,
              item.section,
              item.price,
              item.sale || null,
              item.image || null,
              item.shade || null,
              item.text || null,
              item.hit ? 1 : 0,
              item.installmentMonths || 4,
              item.weightGram || null,
              item.tiers ? JSON.stringify(item.tiers) : null,
              item.tagStyle ? JSON.stringify(item.tagStyle) : null,
            ],
          })),
        ];
        await db.batch(batchStmts, "write");
      } else {
        await db.execute("DELETE FROM products");
        for (const item of list) {
          await db.execute({
            sql: `INSERT OR REPLACE INTO products (id, title, department, section, price, sale, image, shade, text, hit, installmentMonths, weightGram, tiers, tagStyle)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              item.id,
              item.title,
              item.department,
              item.section,
              item.price,
              item.sale || null,
              item.image || null,
              item.shade || null,
              item.text || null,
              item.hit ? 1 : 0,
              item.installmentMonths || 4,
              item.weightGram || null,
              item.tiers ? JSON.stringify(item.tiers) : null,
              item.tagStyle ? JSON.stringify(item.tagStyle) : null,
            ],
          });
        }
      }
    } catch (e) {
      console.error("Turso write error:", e.message);
    }
  }
}

async function dbSaveOrder(order) {
  const db = getClient();
  if (db) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO orders (id, createdAt, name, phone, note, items, total, status, paymentMethod, paymentStatus, paymentDetails)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
          order.id,
          order.createdAt || new Date().toISOString(),
          order.name || "",
          order.phone || "",
          order.note || "",
          JSON.stringify(order.items || []),
          order.total || 0,
          order.status || "new",
          order.paymentMethod || "card",
          order.paymentStatus || "pending",
          typeof order.paymentDetails === "string" ? order.paymentDetails : JSON.stringify(order.paymentDetails || {}),
        ],
      });
      console.log(`✅ Заказ #${order.id} записан в облачную базу Turso!`);
    } catch (e) {
      console.error("Turso order insert error:", e.message);
    }
  }
}

async function dbGetPromotions() {
  if (cachedPromotions && Date.now() < cachedPromotionsExpiresAt) {
    return cachedPromotions;
  }
  const db = getClient();
  if (db) {
    try {
      const res = await db.execute("SELECT * FROM promotions");
      if (res.rows.length) {
        const mapped = res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          badgeText: r.badgeText,
          discountType: r.discountType,
          discountValue: Number(r.discountValue),
          startDate: r.startDate,
          endDate: r.endDate,
          target: r.target,
          active: Boolean(r.active),
        }));
        cachedPromotions = mapped;
        cachedPromotionsExpiresAt = Date.now() + PROMOTIONS_CACHE_TTL_MS;
        return mapped;
      }
    } catch (e) {
      console.error("Turso promo read error:", e.message);
    }
  }
  const file = path.join(ROOT, "promotions.json");
  if (fs.existsSync(file)) {
    const fromJson = JSON.parse(fs.readFileSync(file, "utf8"));
    cachedPromotions = fromJson;
    cachedPromotionsExpiresAt = Date.now() + PROMOTIONS_CACHE_TTL_MS;
    return fromJson;
  }
  return [];
}

async function dbSavePromotions(list) {
  cachedPromotions = Array.isArray(list) ? list : [];
  cachedPromotionsExpiresAt = Date.now() + PROMOTIONS_CACHE_TTL_MS;

  try {
    const file = path.join(ROOT, "promotions.json");
    fs.writeFileSync(file, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {
    // Read-only filesystem on serverless platforms (Vercel)
  }

  const db = getClient();
  if (db) {
    try {
      if (typeof db.batch === "function") {
        const batchStmts = [
          { sql: "DELETE FROM promotions" },
          ...list.map((p) => ({
            sql: `INSERT INTO promotions (id, name, badgeText, discountType, discountValue, startDate, endDate, target, active)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              p.id,
              p.name,
              p.badgeText,
              p.discountType || "percent",
              p.discountValue || 0,
              p.startDate,
              p.endDate,
              p.target || "all",
              p.active ? 1 : 0,
            ],
          })),
        ];
        await db.batch(batchStmts, "write");
      } else {
        await db.execute("DELETE FROM promotions");
        for (const p of list) {
          await db.execute({
            sql: `INSERT INTO promotions (id, name, badgeText, discountType, discountValue, startDate, endDate, target, active)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
              p.id,
              p.name,
              p.badgeText,
              p.discountType || "percent",
              p.discountValue || 0,
              p.startDate,
              p.endDate,
              p.target || "all",
              p.active ? 1 : 0,
            ],
          });
        }
      }
    } catch (e) {
      console.error("Turso promo write error:", e.message);
    }
  }
}

async function dbGetOrders(limit = 20) {
  const db = getClient();
  if (db) {
    try {
      const res = await db.execute({
        sql: `SELECT * FROM orders ORDER BY createdAt DESC LIMIT ?`,
        args: [limit],
      });
      return res.rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt,
        name: r.name,
        phone: r.phone,
        note: r.note,
        items: typeof r.items === "string" ? JSON.parse(r.items || "[]") : r.items,
        total: Number(r.total || 0),
        status: r.status || "new",
        paymentMethod: r.paymentMethod || "card",
        paymentStatus: r.paymentStatus || "pending",
        paymentDetails: typeof r.paymentDetails === "string" ? JSON.parse(r.paymentDetails || "{}") : (r.paymentDetails || {}),
      }));
    } catch (e) {
      console.error("Turso orders select error:", e.message);
    }
  }
  return [];
}

function parseOrderRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdAt: r.createdAt,
    name: r.name,
    phone: r.phone,
    note: r.note,
    items: typeof r.items === "string" ? JSON.parse(r.items || "[]") : r.items,
    total: Number(r.total || 0),
    status: r.status || "new",
    paymentMethod: r.paymentMethod || "card",
    paymentStatus: r.paymentStatus || "pending",
    paymentDetails: typeof r.paymentDetails === "string" ? JSON.parse(r.paymentDetails || "{}") : (r.paymentDetails || {}),
  };
}

async function dbFindOrder(query) {
  const q = String(query || "").trim();
  if (!q) return null;
  const db = getClient();
  if (db) {
    try {
      // 1. Поиск по точному ID (с учетом регистра или в верхнем регистре)
      let res = await db.execute({
        sql: `SELECT * FROM orders WHERE UPPER(id) = ? OR id = ? LIMIT 1`,
        args: [q.toUpperCase(), q],
      });
      if (res.rows.length) {
        return parseOrderRow(res.rows[0]);
      }

      // 2. Поиск по подстроке ID
      const safeIdPart = q.replace(/[%_\\]/g, "\\$&");
      res = await db.execute({
        sql: `SELECT * FROM orders WHERE id LIKE ? ESCAPE '\\' LIMIT 1`,
        args: [`%${safeIdPart}%`],
      });
      if (res.rows.length) {
        return parseOrderRow(res.rows[0]);
      }

      // 3. Поиск по номеру телефона
      const digits = q.replace(/\D/g, "");
      if (digits.length >= 7) {
        const safePhonePart = digits.slice(-7);
        res = await db.execute({
          sql: `SELECT * FROM orders WHERE phone LIKE ? ESCAPE '\\' ORDER BY createdAt DESC LIMIT 1`,
          args: [`%${safePhonePart}%`],
        });
        if (res.rows.length) {
          return parseOrderRow(res.rows[0]);
        }
      }
    } catch (e) {
      console.error("Turso find order error:", e.message);
    }
  }
  return null;
}

async function dbUpdateOrderPayment(orderId, paymentStatus, paymentDetails = null, overallStatus = null) {
  const db = getClient();
  if (db) {
    try {
      const detailsStr = paymentDetails ? (typeof paymentDetails === "string" ? paymentDetails : JSON.stringify(paymentDetails)) : null;
      if (overallStatus) {
        await db.execute({
          sql: detailsStr
            ? `UPDATE orders SET paymentStatus = ?, paymentDetails = ?, status = ? WHERE id = ?`
            : `UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?`,
          args: detailsStr ? [paymentStatus, detailsStr, overallStatus, String(orderId)] : [paymentStatus, overallStatus, String(orderId)],
        });
      } else {
        await db.execute({
          sql: detailsStr
            ? `UPDATE orders SET paymentStatus = ?, paymentDetails = ? WHERE id = ?`
            : `UPDATE orders SET paymentStatus = ? WHERE id = ?`,
          args: detailsStr ? [paymentStatus, detailsStr, String(orderId)] : [paymentStatus, String(orderId)],
        });
      }
      return true;
    } catch (e) {
      console.error("Turso update order payment error:", e.message);
    }
  }
  return false;
}

async function dbUpdateOrderStatus(orderId, status) {
  const db = getClient();
  if (db) {
    try {
      await db.execute({
        sql: `UPDATE orders SET status = ? WHERE id = ?`,
        args: [status, String(orderId)],
      });
      return true;
    } catch (e) {
      console.error("Turso update order status error:", e.message);
    }
  }
  return false;
}

async function dbGetAuthorizedTelegramUsers() {
  const db = getClient();
  if (db) {
    try {
      const res = await db.execute("SELECT * FROM telegram_authorized_users");
      return res.rows.map((r) => ({
        id: String(r.id),
        username: r.username || "",
        firstName: r.firstName || "",
        authorizedAt: r.authorizedAt || "",
      }));
    } catch (e) {
      console.error("Turso get authorized telegram users error:", e.message);
    }
  }
  return [];
}

async function dbSaveAuthorizedTelegramUser(user) {
  const db = getClient();
  if (db) {
    try {
      await db.execute({
        sql: `INSERT OR REPLACE INTO telegram_authorized_users (id, username, firstName, authorizedAt)
              VALUES (?, ?, ?, ?)`,
        args: [
          String(user.id),
          user.username || "",
          user.firstName || "",
          user.authorizedAt || new Date().toISOString(),
        ],
      });
      return true;
    } catch (e) {
      console.error("Turso save authorized telegram user error:", e.message);
    }
  }
  return false;
}

async function dbRemoveAuthorizedTelegramUser(userId) {
  const db = getClient();
  if (db) {
    try {
      await db.execute({
        sql: `DELETE FROM telegram_authorized_users WHERE id = ?`,
        args: [String(userId)],
      });
      return true;
    } catch (e) {
      console.error("Turso remove authorized telegram user error:", e.message);
    }
  }
  return false;
}

module.exports = {
  getClient,
  initTurso,
  dbGetProducts,
  dbSaveProducts,
  dbSaveOrder,
  dbGetOrders,
  dbFindOrder,
  dbUpdateOrderStatus,
  dbUpdateOrderPayment,
  dbGetPromotions,
  dbSavePromotions,
  dbGetAuthorizedTelegramUsers,
  dbSaveAuthorizedTelegramUser,
  dbRemoveAuthorizedTelegramUser,
};
