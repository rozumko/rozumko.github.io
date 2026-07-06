// Аватари учнів — спільна мапа слаг → ілюстрація/підпис.
// Джерело правди для allowlist — backend SCHOOL_AVATARS; цей список мусить збігатися.
// Ілюстрації: public/avatars/<slug>.png (див. scripts/optimize-images.mjs).

export const AVATARS = [
  'astronaut', 'wizard', 'detective', 'explorer', 'gamer',
  'hero', 'ninja', 'pirat', 'princess', 'artist',
  'emo', 'terminator',
] as const

export type Avatar = (typeof AVATARS)[number]

const LABELS: Record<Avatar, string> = {
  astronaut: 'Космонавт',
  wizard: 'Чарівник',
  detective: 'Детектив',
  explorer: 'Дослідник',
  gamer: 'Геймер',
  hero: 'Герой',
  ninja: 'Ніндзя',
  pirat: 'Пірат',
  princess: 'Принцеса',
  artist: 'Художник',
  emo: 'Емо',
  terminator: 'Термінатор',
}

const AVATAR_SET = new Set<string>(AVATARS)

export function isAvatar(slug: unknown): slug is Avatar {
  return typeof slug === 'string' && AVATAR_SET.has(slug)
}

// Підпис для aria-label / міток. Невідомий слаг (напр. стара сесія) → сам слаг.
export function avatarLabel(slug: string): string {
  return isAvatar(slug) ? LABELS[slug] : slug
}

// Шлях до ілюстрації. Невідомий слаг → плейсхолдер першого аватара (без 404).
export function avatarSrc(slug: string): string {
  return `/avatars/${isAvatar(slug) ? slug : AVATARS[0]}.png`
}
