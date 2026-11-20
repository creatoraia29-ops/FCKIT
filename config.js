// Конфигурация API для магазина FCKIT
window.FCKIT_API_URL = window.location.hostname.includes("github.io")
  ? "https://fckit.onrender.com"
  : (window.FCKIT_API_URL || "");

function getApiUrl(path) {
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
