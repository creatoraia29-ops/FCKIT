// Конфигурация API для магазина FCKIT
// На GitHub Pages запросы идут на наш рабочий Vercel бэкенд
window.FCKIT_API_URL = window.location.hostname.includes("github.io")
  ? "https://fckit-creatoraia29-ops.vercel.app"
  : (window.FCKIT_API_URL || "");

function getApiUrl(path) {
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
