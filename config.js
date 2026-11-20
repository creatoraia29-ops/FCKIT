// Конфигурация API для магазина FCKIT
// При деплое бэкенда на Vercel и фронтенда на GitHub Pages
// укажите здесь URL вашего бэкенда на Vercel (например: "https://fckit-api.vercel.app")
window.FCKIT_API_URL = window.FCKIT_API_URL || "";

function getApiUrl(path) {
  const base = (window.FCKIT_API_URL || "").replace(/\/+$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return base ? `${base}${p}` : p;
}
