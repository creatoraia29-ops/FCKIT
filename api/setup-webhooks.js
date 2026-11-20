module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Content-Type", "application/json; charset=utf-8");

  if (req.method === "OPTIONS") {
    res.statusCode = 204;
    res.end();
    return;
  }

  const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || "9007119182:AAEI88xn8BC5yjp9ZCpHjei2wxZIEbSp5Gs";
  const TELEGRAM_CUSTOMER_BOT_TOKEN = process.env.TELEGRAM_CUSTOMER_BOT_TOKEN || "9241739958:AAFHr4AHnF4V9EDLzFyp6LD1hY8R5kLyUk8";

  const host = req.headers["x-forwarded-host"] || req.headers.host || "fckit-creatoraia29-ops.vercel.app";
  const proto = req.headers["x-forwarded-proto"] || "https";
  const base = `${proto}://${host}`;

  const adminWebhookUrl = `${base}/api/webhook-admin`;
  const customerWebhookUrl = `${base}/api/webhook-customer`;

  const results = { base, admin: null, customer: null };

  try {
    const r1 = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: adminWebhookUrl }),
    });
    results.admin = await r1.json();
  } catch (e) {
    results.admin = { error: e.message };
  }

  try {
    const r2 = await fetch(`https://api.telegram.org/bot${TELEGRAM_CUSTOMER_BOT_TOKEN}/setWebhook`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: customerWebhookUrl }),
    });
    results.customer = await r2.json();
  } catch (e) {
    results.customer = { error: e.message };
  }

  res.statusCode = 200;
  res.end(JSON.stringify({ ok: true, webhooks: results }));
};
