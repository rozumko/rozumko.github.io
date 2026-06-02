// Render додає рівно один reverse-proxy hop перед застосунком.
// Не змінювати на true: тоді клієнт зможе підробити X-Forwarded-For
// і отримувати новий rate-limit bucket для кожного фейкового IP.
export const FASTIFY_SECURITY_OPTIONS = {
  trustProxy: 1,
} as const
