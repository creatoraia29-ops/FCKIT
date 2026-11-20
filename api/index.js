let serverModule = null;
let loadError = null;

try {
  serverModule = require("../server.js");
} catch (err) {
  loadError = err;
  console.error("Failed to load server.js in Vercel function:", err);
}

module.exports = async (req, res) => {
  if (loadError) {
    res.statusCode = 500;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({
      error: "Server module load error",
      message: loadError.message,
      stack: loadError.stack,
    }, null, 2));
    return;
  }

  try {
    await serverModule.handleRequest(req, res);
  } catch (err) {
    console.error("Request handling error:", err);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.end(JSON.stringify({
        error: "Request execution error",
        message: err.message,
        stack: err.stack,
      }, null, 2));
    } else {
      res.end();
    }
  }
};
