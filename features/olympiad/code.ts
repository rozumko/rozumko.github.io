const LATIN_TO_CYR: Record<string, string> = {
  A: 'А', B: 'В', C: 'С', E: 'Е', H: 'Н', I: 'І', K: 'К', M: 'М', O: 'О', P: 'Р', T: 'Т', X: 'Х',
}

export function normalizeOlympiadCode(raw: string): string {
  return raw
    .trim()
    .toUpperCase()
    .split('')
    .map(char => LATIN_TO_CYR[char] ?? char)
    .join('')
    .replace(/\s+/g, '')
}
