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

// -----------------------------------------------------------------------------
// ДРАЙВЕРЫ БАЗ ДАННЫХ: Neon PostgreSQL (приоритет) или Turso LibSQL (резерв)
// -----------------------------------------------------------------------------
let pgPool = null;
let tursoClient = null;

function getPostgresUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.DATABASE_URL_UNPOOLED ||
    process.env.POSTGRES_URL ||
    process.env.NEON_DATABASE_URL ||
    ""
  );
}

function getPgPool() {
  const pgUrl = getPostgresUrl();
  if (!pgPool && pgUrl) {
    try {
      const { Pool } = require("pg");
      pgPool = new Pool({
        connectionString: pgUrl,
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 5000,
      });
      pgPool.on("error", (err) => {
        console.error("Neon Postgres Pool error:", err.message);
      });
    } catch (err) {
      console.error("Ошибка инициализации Neon Postgres:", err.message);
    }
  }
  return pgPool;
}

function getTursoClient() {
  if (!tursoClient && process.env.TURSO_DATABASE_URL && process.env.TURSO_AUTH_TOKEN) {
    try {
      let createClient;
      try {
        createClient = require("@libsql/client/web").createClient;
      } catch {
        createClient = require("@libsql/client").createClient;
      }
      tursoClient = createClient({
        url: process.env.TURSO_DATABASE_URL,
        authToken: process.env.TURSO_AUTH_TOKEN,
      });
    } catch (err) {
      console.error("Ошибка инициализации Turso клиента:", err.message);
    }
  }
  return tursoClient;
}

function getClient() {
  // Для совместимости: если есть Neon Postgres, возвращаем объект-обертку, либо Turso
  const pg = getPgPool();
  if (pg) return pg;
  return getTursoClient();
}

function isPostgres() {
  return Boolean(getPgPool());
}

// -----------------------------------------------------------------------------
// ИНИЦИАЛИЗАЦИЯ И МИГРАЦИЯ СХЕМЫ
// -----------------------------------------------------------------------------
async function initDatabase() {
  const pg = getPgPool();
  if (pg) {
    try {
      const client = await pg.connect();
      try {
        // 1. Таблица товаров
        await client.query(`
          CREATE TABLE IF NOT EXISTS products (
            id BIGINT PRIMARY KEY,
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

        // 2. Таблица заказов
        await client.query(`
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
        await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_created ON orders (createdAt DESC);`);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders (phone);`);

        // 3. Таблица акций
        await client.query(`
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

        // 4. Таблица администраторов Telegram
        await client.query(`
          CREATE TABLE IF NOT EXISTS telegram_authorized_users (
            id TEXT PRIMARY KEY,
            username TEXT,
            firstName TEXT,
            authorizedAt TEXT
          );
        `);

        // 5. Таблица всех пользователей (покупатели, клиенты, администраторы)
        await client.query(`
          CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            phone TEXT UNIQUE,
            name TEXT,
            email TEXT,
            role TEXT DEFAULT 'customer',
            createdAt TEXT,
            metadata TEXT
          );
        `);
        await client.query(`CREATE INDEX IF NOT EXISTS idx_users_phone ON users (phone);`);

        // Миграция существующих товаров из products.json в Neon Postgres
        const existingProducts = await client.query("SELECT COUNT(*) AS count FROM products");
        const productCount = Number(existingProducts.rows[0]?.count || 0);

        if (productCount === 0) {
          const pfile = path.join(ROOT, "products.json");
          if (fs.existsSync(pfile)) {
            const list = JSON.parse(fs.readFileSync(pfile, "utf8"));
            for (const item of list) {
              await client.query(
                `INSERT INTO products (id, title, department, section, price, sale, image, shade, text, hit, installmentMonths, weightGram, tiers, tagStyle)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
                 ON CONFLICT (id) DO UPDATE SET
                   title = EXCLUDED.title, department = EXCLUDED.department, section = EXCLUDED.section,
                   price = EXCLUDED.price, sale = EXCLUDED.sale, image = EXCLUDED.image, shade = EXCLUDED.shade,
                   text = EXCLUDED.text, hit = EXCLUDED.hit, installmentMonths = EXCLUDED.installmentMonths,
                   weightGram = EXCLUDED.weightGram, tiers = EXCLUDED.tiers, tagStyle = EXCLUDED.tagStyle`,
                [
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
                ]
              );
            }
            console.log(`✅ В Neon Postgres перенесено ${list.length} товаров из локальной базы!`);
          }
        }

        // Миграция существующих администраторов из telegram_authorized_users.json
        const existingTgUsers = await client.query("SELECT COUNT(*) AS count FROM telegram_authorized_users");
        if (Number(existingTgUsers.rows[0]?.count || 0) === 0) {
          const tgFile = path.join(ROOT, "telegram_authorized_users.json");
          if (fs.existsSync(tgFile)) {
            const list = JSON.parse(fs.readFileSync(tgFile, "utf8"));
            for (const u of list) {
              if (u && u.id) {
                await client.query(
                  `INSERT INTO telegram_authorized_users (id, username, firstName, authorizedAt)
                   VALUES ($1, $2, $3, $4)
                   ON CONFLICT (id) DO UPDATE SET username = EXCLUDED.username, firstName = EXCLUDED.firstName`,
                  [String(u.id), u.username || "", u.firstName || "", u.authorizedAt || new Date().toISOString()]
                );
                // Также в таблицу users как admin
                await client.query(
                  `INSERT INTO users (id, phone, name, email, role, createdAt, metadata)
                   VALUES ($1, $2, $3, $4, 'admin', $5, $6)
                   ON CONFLICT (id) DO NOTHING`,
                  [
                    `tg_${u.id}`,
                    null,
                    u.firstName || u.username || `TG-${u.id}`,
                    null,
                    u.authorizedAt || new Date().toISOString(),
                    JSON.stringify({ telegramId: String(u.id), username: u.username || "" }),
                  ]
                );
              }
            }
            console.log(`✅ В Neon Postgres перенесено ${list.length} администраторов!`);
          }
        }

        // Миграция промоакций
        const existingPromos = await client.query("SELECT COUNT(*) AS count FROM promotions");
        if (Number(existingPromos.rows[0]?.count || 0) === 0) {
          const promoFile = path.join(ROOT, "promotions.json");
          if (fs.existsSync(promoFile)) {
            const list = JSON.parse(fs.readFileSync(promoFile, "utf8"));
            for (const p of list) {
              await client.query(
                `INSERT INTO promotions (id, name, badgeText, discountType, discountValue, startDate, endDate, target, active)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (id) DO NOTHING`,
                [
                  p.id,
                  p.name,
                  p.badgeText,
                  p.discountType || "percent",
                  p.discountValue || 0,
                  p.startDate,
                  p.endDate,
                  p.target || "all",
                  p.active ? 1 : 0,
                ]
              );
            }
          }
        }

        console.log("✅ База данных Neon PostgreSQL успешно подключена и инициализирована!");
        return true;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error("Ошибка подключения к Neon PostgreSQL:", err.message);
    }
  }

  // Резерв: Turso LibSQL
  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute(`
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
      await turso.execute(`
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
      await turso.execute(`
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
      await turso.execute(`
        CREATE TABLE IF NOT EXISTS telegram_authorized_users (
          id TEXT PRIMARY KEY,
          username TEXT,
          firstName TEXT,
          authorizedAt TEXT
        );
      `);
      console.log("✅ База данных Turso успешно подключена!");
      return true;
    } catch (err) {
      console.error("Ошибка подключения к Turso:", err.message);
    }
  }

  return false;
}

// Алиас для обратной совместимости
const initTurso = initDatabase;

// -----------------------------------------------------------------------------
// КЭШИРОВАНИЕ И МЕТОДЫ РАБОТЫ С ТОВАРАМИ
// -----------------------------------------------------------------------------
let cachedProducts = null;
let cachedProductsExpiresAt = 0;
const PRODUCTS_CACHE_TTL_MS = 60 * 1000;

let cachedPromotions = null;
let cachedPromotionsExpiresAt = 0;
const PROMOTIONS_CACHE_TTL_MS = 60 * 1000;

function mapProductRow(row) {
  return {
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
    installmentMonths: Number(row.installmentmonths || row.installmentMonths || 4),
    weightGram: row.weightgram || row.weightGram ? Number(row.weightgram || row.weightGram) : null,
    tiers: row.tiers ? (typeof row.tiers === "string" ? JSON.parse(row.tiers) : row.tiers) : null,
    tagStyle: row.tagstyle || row.tagStyle ? (typeof (row.tagstyle || row.tagStyle) === "string" ? JSON.parse(row.tagstyle || row.tagStyle) : (row.tagstyle || row.tagStyle)) : null,
  };
}

async function dbGetProducts() {
  if (cachedProducts && Date.now() < cachedProductsExpiresAt) {
    return cachedProducts;
  }

  const pg = getPgPool();
  if (pg) {
    try {
      const res = await pg.query("SELECT * FROM products ORDER BY id ASC");
      const mapped = res.rows.map(mapProductRow);
      cachedProducts = mapped;
      cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;
      return mapped;
    } catch (e) {
      console.error("Neon Postgres products read error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      const res = await turso.execute("SELECT * FROM products ORDER BY id ASC");
      const mapped = (res.rows || []).map(mapProductRow);
      cachedProducts = mapped;
      cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;
      return mapped;
    } catch (e) {
      console.error("Turso read error:", e.message);
    }
  }

  const pfile = path.join(ROOT, "products.json");
  if (fs.existsSync(pfile)) {
    try {
      const fromJson = JSON.parse(fs.readFileSync(pfile, "utf8"));
      cachedProducts = fromJson;
      cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;
      return fromJson;
    } catch {}
  }
  return [];
}

async function dbSaveProducts(list) {
  cachedProducts = Array.isArray(list) ? list : [];
  cachedProductsExpiresAt = Date.now() + PRODUCTS_CACHE_TTL_MS;

  try {
    const pfile = path.join(ROOT, "products.json");
    fs.writeFileSync(pfile, JSON.stringify(list, null, 2), "utf8");
  } catch (e) {}

  const pg = getPgPool();
  if (pg) {
    const client = await pg.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM products");
      for (const item of list) {
        await client.query(
          `INSERT INTO products (id, title, department, section, price, sale, image, shade, text, hit, installmentMonths, weightGram, tiers, tagStyle)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
          [
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
          ]
        );
      }
      await client.query("COMMIT");
      return;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Neon Postgres products save error:", e.message);
    } finally {
      client.release();
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute("DELETE FROM products");
      for (const item of list) {
        await turso.execute({
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
    } catch (e) {
      console.error("Turso write error:", e.message);
    }
  }
}

// -----------------------------------------------------------------------------
// МЕТОДЫ РАБОТЫ С ЗАКАЗАМИ
// -----------------------------------------------------------------------------
async function dbSaveOrder(order) {
  const pg = getPgPool();
  if (pg) {
    try {
      await pg.query(
        `INSERT INTO orders (id, createdAt, name, phone, note, items, total, status, paymentMethod, paymentStatus, paymentDetails)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
         ON CONFLICT (id) DO UPDATE SET
           createdAt = EXCLUDED.createdAt,
           name = EXCLUDED.name,
           phone = EXCLUDED.phone,
           note = EXCLUDED.note,
           items = EXCLUDED.items,
           total = EXCLUDED.total,
           status = EXCLUDED.status,
           paymentMethod = EXCLUDED.paymentMethod,
           paymentStatus = EXCLUDED.paymentStatus,
           paymentDetails = EXCLUDED.paymentDetails`,
        [
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
        ]
      );

      // Автоматически фиксируем пользователя/покупателя в таблице users
      if (order.phone) {
        const cleanPhone = String(order.phone).trim();
        const userId = `usr_${cleanPhone.replace(/\D/g, "") || Date.now()}`;
        await pg.query(
          `INSERT INTO users (id, phone, name, role, createdAt, metadata)
           VALUES ($1, $2, $3, 'customer', $4, $5)
           ON CONFLICT (phone) DO UPDATE SET
             name = COALESCE(EXCLUDED.name, users.name),
             metadata = EXCLUDED.metadata`,
          [
            userId,
            cleanPhone,
            order.name || "Покупатель",
            order.createdAt || new Date().toISOString(),
            JSON.stringify({ lastOrderId: order.id, lastOrderTotal: order.total }),
          ]
        );
      }

      console.log(`✅ Заказ #${order.id} записан в Neon PostgreSQL!`);
      return;
    } catch (e) {
      console.error("Neon Postgres order insert error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute({
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

function parseOrderRow(r) {
  if (!r) return null;
  return {
    id: r.id,
    createdAt: r.createdat || r.createdAt,
    name: r.name,
    phone: r.phone,
    note: r.note,
    items: typeof r.items === "string" ? JSON.parse(r.items || "[]") : (r.items || []),
    total: Number(r.total || 0),
    status: r.status || "new",
    paymentMethod: r.paymentmethod || r.paymentMethod || "card",
    paymentStatus: r.paymentstatus || r.paymentStatus || "pending",
    paymentDetails: typeof (r.paymentdetails || r.paymentDetails) === "string"
      ? JSON.parse(r.paymentdetails || r.paymentDetails || "{}")
      : (r.paymentdetails || r.paymentDetails || {}),
  };
}

async function dbGetOrders(limit = 50) {
  const pg = getPgPool();
  if (pg) {
    try {
      const res = await pg.query("SELECT * FROM orders ORDER BY createdAt DESC LIMIT $1", [limit]);
      return res.rows.map(parseOrderRow);
    } catch (e) {
      console.error("Neon Postgres orders select error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      const res = await turso.execute({
        sql: `SELECT * FROM orders ORDER BY createdAt DESC LIMIT ?`,
        args: [limit],
      });
      return res.rows.map(parseOrderRow);
    } catch (e) {
      console.error("Turso orders select error:", e.message);
    }
  }
  return [];
}

async function dbFindOrder(query) {
  const q = String(query || "").trim();
  if (!q) return null;

  const pg = getPgPool();
  if (pg) {
    try {
      let res = await pg.query("SELECT * FROM orders WHERE UPPER(id) = UPPER($1) OR id = $1 LIMIT 1", [q]);
      if (res.rows.length) return parseOrderRow(res.rows[0]);

      res = await pg.query("SELECT * FROM orders WHERE id ILIKE $1 LIMIT 1", [`%${q}%`]);
      if (res.rows.length) return parseOrderRow(res.rows[0]);

      const digits = q.replace(/\D/g, "");
      if (digits.length >= 7) {
        const safePhonePart = digits.slice(-7);
        res = await pg.query("SELECT * FROM orders WHERE phone LIKE $1 ORDER BY createdAt DESC LIMIT 1", [`%${safePhonePart}%`]);
        if (res.rows.length) return parseOrderRow(res.rows[0]);
      }
    } catch (e) {
      console.error("Neon Postgres find order error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      let res = await turso.execute({
        sql: `SELECT * FROM orders WHERE UPPER(id) = ? OR id = ? LIMIT 1`,
        args: [q.toUpperCase(), q],
      });
      if (res.rows.length) return parseOrderRow(res.rows[0]);

      const safeIdPart = q.replace(/[%_\\]/g, "\\$&");
      res = await turso.execute({
        sql: `SELECT * FROM orders WHERE id LIKE ? ESCAPE '\\' LIMIT 1`,
        args: [`%${safeIdPart}%`],
      });
      if (res.rows.length) return parseOrderRow(res.rows[0]);

      const digits = q.replace(/\D/g, "");
      if (digits.length >= 7) {
        const safePhonePart = digits.slice(-7);
        res = await turso.execute({
          sql: `SELECT * FROM orders WHERE phone LIKE ? ESCAPE '\\' ORDER BY createdAt DESC LIMIT 1`,
          args: [`%${safePhonePart}%`],
        });
        if (res.rows.length) return parseOrderRow(res.rows[0]);
      }
    } catch (e) {
      console.error("Turso find order error:", e.message);
    }
  }
  return null;
}

async function dbUpdateOrderPayment(orderId, paymentStatus, paymentDetails = null, overallStatus = null) {
  const detailsStr = paymentDetails ? (typeof paymentDetails === "string" ? paymentDetails : JSON.stringify(paymentDetails)) : null;

  const pg = getPgPool();
  if (pg) {
    try {
      if (overallStatus) {
        await pg.query(
          detailsStr
            ? `UPDATE orders SET paymentStatus = $1, paymentDetails = $2, status = $3 WHERE id = $4`
            : `UPDATE orders SET paymentStatus = $1, status = $2 WHERE id = $3`,
          detailsStr ? [paymentStatus, detailsStr, overallStatus, String(orderId)] : [paymentStatus, overallStatus, String(orderId)]
        );
      } else {
        await pg.query(
          detailsStr
            ? `UPDATE orders SET paymentStatus = $1, paymentDetails = $2 WHERE id = $3`
            : `UPDATE orders SET paymentStatus = $1 WHERE id = $2`,
          detailsStr ? [paymentStatus, detailsStr, String(orderId)] : [paymentStatus, String(orderId)]
        );
      }
      return true;
    } catch (e) {
      console.error("Neon Postgres update order payment error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      if (overallStatus) {
        await turso.execute({
          sql: detailsStr
            ? `UPDATE orders SET paymentStatus = ?, paymentDetails = ?, status = ? WHERE id = ?`
            : `UPDATE orders SET paymentStatus = ?, status = ? WHERE id = ?`,
          args: detailsStr ? [paymentStatus, detailsStr, overallStatus, String(orderId)] : [paymentStatus, overallStatus, String(orderId)],
        });
      } else {
        await turso.execute({
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
  const pg = getPgPool();
  if (pg) {
    try {
      await pg.query("UPDATE orders SET status = $1 WHERE id = $2", [status, String(orderId)]);
      return true;
    } catch (e) {
      console.error("Neon Postgres update order status error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute({
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

// -----------------------------------------------------------------------------
// МЕТОДЫ РАБОТЫ С АКЦИЯМИ
// -----------------------------------------------------------------------------
async function dbGetPromotions() {
  if (cachedPromotions && Date.now() < cachedPromotionsExpiresAt) {
    return cachedPromotions;
  }

  const pg = getPgPool();
  if (pg) {
    try {
      const res = await pg.query("SELECT * FROM promotions");
      if (res.rows.length) {
        const mapped = res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          badgeText: r.badgetext || r.badgeText,
          discountType: r.discounttype || r.discountType,
          discountValue: Number(r.discountvalue || r.discountValue),
          startDate: r.startdate || r.startDate,
          endDate: r.enddate || r.endDate,
          target: r.target,
          active: Boolean(r.active),
        }));
        cachedPromotions = mapped;
        cachedPromotionsExpiresAt = Date.now() + PROMOTIONS_CACHE_TTL_MS;
        return mapped;
      }
    } catch (e) {
      console.error("Neon Postgres promo read error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      const res = await turso.execute("SELECT * FROM promotions");
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
  } catch (e) {}

  const pg = getPgPool();
  if (pg) {
    const client = await pg.connect();
    try {
      await client.query("BEGIN");
      await client.query("DELETE FROM promotions");
      for (const p of list) {
        await client.query(
          `INSERT INTO promotions (id, name, badgeText, discountType, discountValue, startDate, endDate, target, active)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
          [
            p.id,
            p.name,
            p.badgeText,
            p.discountType || "percent",
            p.discountValue || 0,
            p.startDate,
            p.endDate,
            p.target || "all",
            p.active ? 1 : 0,
          ]
        );
      }
      await client.query("COMMIT");
      return;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error("Neon Postgres promo save error:", e.message);
    } finally {
      client.release();
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute("DELETE FROM promotions");
      for (const p of list) {
        await turso.execute({
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
    } catch (e) {
      console.error("Turso promo write error:", e.message);
    }
  }
}

// -----------------------------------------------------------------------------
// МЕТОДЫ РАБОТЫ С ПОЛЬЗОВАТЕЛЯМИ И TELEGRAM АДМИНИСТРАТОРАМИ
// -----------------------------------------------------------------------------
async function dbGetAuthorizedTelegramUsers() {
  const pg = getPgPool();
  if (pg) {
    try {
      const res = await pg.query("SELECT * FROM telegram_authorized_users");
      return res.rows.map((r) => ({
        id: String(r.id),
        username: r.username || "",
        firstName: r.firstname || r.firstName || "",
        authorizedAt: r.authorizedat || r.authorizedAt || "",
      }));
    } catch (e) {
      console.error("Neon Postgres get authorized tg users error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      const res = await turso.execute("SELECT * FROM telegram_authorized_users");
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
  const pg = getPgPool();
  if (pg) {
    try {
      await pg.query(
        `INSERT INTO telegram_authorized_users (id, username, firstName, authorizedAt)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO UPDATE SET
           username = EXCLUDED.username,
           firstName = EXCLUDED.firstName,
           authorizedAt = EXCLUDED.authorizedAt`,
        [
          String(user.id),
          user.username || "",
          user.firstName || user.first_name || "",
          user.authorizedAt || new Date().toISOString(),
        ]
      );
      // Также дублируем в users
      await pg.query(
        `INSERT INTO users (id, phone, name, email, role, createdAt, metadata)
         VALUES ($1, $2, $3, $4, 'admin', $5, $6)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           role = 'admin',
           metadata = EXCLUDED.metadata`,
        [
          `tg_${user.id}`,
          null,
          user.firstName || user.first_name || user.username || `TG-${user.id}`,
          null,
          user.authorizedAt || new Date().toISOString(),
          JSON.stringify({ telegramId: String(user.id), username: user.username || "" }),
        ]
      );
      return true;
    } catch (e) {
      console.error("Neon Postgres save tg user error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute({
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
  const pg = getPgPool();
  if (pg) {
    try {
      await pg.query("DELETE FROM telegram_authorized_users WHERE id = $1", [String(userId)]);
      await pg.query("DELETE FROM users WHERE id = $1", [`tg_${userId}`]);
      return true;
    } catch (e) {
      console.error("Neon Postgres remove tg user error:", e.message);
    }
  }

  const turso = getTursoClient();
  if (turso) {
    try {
      await turso.execute({
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

// Получить всех пользователей (покупатели + администраторы)
async function dbGetUsers(limit = 100) {
  const pg = getPgPool();
  if (pg) {
    try {
      const res = await pg.query("SELECT * FROM users ORDER BY createdAt DESC LIMIT $1", [limit]);
      return res.rows.map((r) => ({
        id: r.id,
        phone: r.phone,
        name: r.name,
        email: r.email,
        role: r.role || "customer",
        createdAt: r.createdat || r.createdAt,
        metadata: r.metadata ? (typeof r.metadata === "string" ? JSON.parse(r.metadata) : r.metadata) : null,
      }));
    } catch (e) {
      console.error("Neon Postgres get users error:", e.message);
    }
  }
  return [];
}

async function dbSaveUser(user) {
  const pg = getPgPool();
  if (pg) {
    try {
      await pg.query(
        `INSERT INTO users (id, phone, name, email, role, createdAt, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (id) DO UPDATE SET
           phone = EXCLUDED.phone,
           name = EXCLUDED.name,
           email = EXCLUDED.email,
           role = EXCLUDED.role,
           metadata = EXCLUDED.metadata`,
        [
          user.id || `usr_${Date.now()}`,
          user.phone || null,
          user.name || "",
          user.email || null,
          user.role || "customer",
          user.createdAt || new Date().toISOString(),
          user.metadata ? (typeof user.metadata === "string" ? user.metadata : JSON.stringify(user.metadata)) : null,
        ]
      );
      return true;
    } catch (e) {
      console.error("Neon Postgres save user error:", e.message);
    }
  }
  return false;
}

module.exports = {
  getClient,
  isPostgres,
  initDatabase,
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
  dbGetUsers,
  dbSaveUser,
};
