// Конфигурация API для магазина FCKIT
// При работе на GitHub Pages запросы автоматически идут на наш активный бэкенд
window.FCKIT_API_URL = window.location.hostname.includes("github.io")
  ? "https://encouraging-bicycle-terrorism-participate.trycloudflare.com"
  : (window.FCKIT_API_URL || "");

function getApiUrl(path) {
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
