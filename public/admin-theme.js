// Applies the saved admin theme before the first paint. A classic script in
// <head> runs synchronously; the module bundle runs too late to avoid a flash.
try {
  if (localStorage.getItem('rozumko.admin.theme') === 'dark') document.documentElement.dataset.adminTheme = 'dark'
} catch { /* storage unavailable: keep the light default */ }
