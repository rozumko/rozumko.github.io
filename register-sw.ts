// Реєстрація Service Worker (PWA offline). Винесено з інлайн-скрипта в HTML,
// щоб CSP могла лишатися строгою (script-src 'self', без 'unsafe-inline').
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {})
}
