// Конфигурация API для магазина FCKIT
window.FCKIT_API_URL = (
  window.location.hostname === "localhost" ||
  window.location.hostname === "127.0.0.1" ||
  window.location.hostname.includes("onrender.com")
)
  ? (window.FCKIT_API_URL || "")
  : "https://fckit.onrender.com";

function getApiUrl(path) {
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
