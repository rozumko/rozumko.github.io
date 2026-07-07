import { defineConfig } from '@playwright/test'

// Layout-тести контракту quiz-fit (див. style.css: «quiz-fit»).
// Сервер: vite preview роздає dist/ — перед запуском потрібен `npm run build`.
export default defineConfig({
  testDir: 'tests/layout',
  timeout: 60_000,
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: {
    baseURL: 'http://localhost:4173',
    // SW перехоплював би /questions/ повз route-фікстури тестів
    serviceWorkers: 'block',
  },
  webServer: {
    command: 'npm run preview',
    port: 4173,
    reuseExistingServer: !process.env['CI'],
  },
})
