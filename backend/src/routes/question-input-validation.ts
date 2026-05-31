// Валідація і нормалізація питання за типом — чиста функція, без I/O.
// Викликається з admin POST/PUT. Кидає Error з людським повідомленням.
//
// Структура options і correct за типом:
//   choice    options: string[] (≥2)                       correct: int 0..len-1
//   truefalse options: ['Так','Ні']                        correct: 0|1
//   sequence  options: { given: string[], choices: string[]≥2 }   correct: int 0..choices-1
//   sort      options: { items: string[]≥2, correctOrder: number[] (перестановка) }   correct: null
//   match     options: { left: string[], right: string[], pairs: number[] }           correct: null
//   input     options: { answer: string|number, inputType?: 'text'|'number' }         correct: null

export type QuestionType = 'choice' | 'truefalse' | 'input' | 'sort' | 'sequence' | 'match'

export const QUESTION_TYPES: QuestionType[] = ['choice', 'truefalse', 'input', 'sort', 'sequence', 'match']

export interface NormalizedQuestionShape {
  type: QuestionType
  options: unknown
  correct: number | null
}

function asArray(v: unknown): unknown[] | null {
  return Array.isArray(v) ? v : null
}
function asObject(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null
}
function isStringList(v: unknown, min = 1, max = 100): v is string[] {
  const a = asArray(v)
  return !!a && a.length >= min && a.length <= max && a.every(x => typeof x === 'string' && x.trim() !== '')
}
function isIntList(v: unknown, len: number): v is number[] {
  const a = asArray(v)
  return !!a && a.length === len && a.every(x => typeof x === 'number' && Number.isInteger(x) && x >= 0)
}
function isPermutation(v: unknown, len: number): boolean {
  if (!isIntList(v, len)) return false
  const sorted = [...(v as number[])].sort((a, b) => a - b)
  return sorted.every((x, i) => x === i)
}

/**
 * Валідує і повертає нормалізовану форму. type, options, correct — як прийшли з тіла запиту.
 * isPatch=true дозволяє часткове (PUT): якщо options/correct не передані — їх не перевіряємо тут
 * (викликач має змерджити з поточним станом і викликати ще раз з повним набором).
 */
export function validateQuestionShape(type: QuestionType, options: unknown, correct: number | null | undefined): NormalizedQuestionShape {
  if (!QUESTION_TYPES.includes(type)) throw new Error(`Невідомий тип питання: ${type}`)

  switch (type) {
    case 'choice': {
      if (!isStringList(options, 2, 100)) throw new Error('choice: потрібно від 2 до 100 непорожніх варіантів')
      const len = (options as string[]).length
      if (correct == null || !Number.isInteger(correct) || correct < 0 || correct >= len)
        throw new Error(`choice: correct має бути індексом 0..${len - 1}`)
      return { type, options, correct }
    }
    case 'truefalse': {
      // options фіксовані; correct 0 (Так) або 1 (Ні)
      if (correct !== 0 && correct !== 1) throw new Error('truefalse: correct має бути 0 (Так) або 1 (Ні)')
      return { type, options: ['Так', 'Ні'], correct }
    }
    case 'sequence': {
      const o = asObject(options)
      if (!o || !isStringList(o['given'], 1)) throw new Error('sequence: потрібна задана послідовність (given)')
      if (!isStringList(o['choices'], 2, 100)) throw new Error('sequence: потрібно від 2 до 100 варіантів (choices)')
      const len = (o['choices'] as string[]).length
      if (correct == null || !Number.isInteger(correct) || correct < 0 || correct >= len)
        throw new Error(`sequence: correct має бути індексом 0..${len - 1}`)
      return { type, options: { given: o['given'], choices: o['choices'] }, correct }
    }
    case 'sort': {
      const o = asObject(options)
      if (!o || !isStringList(o['items'], 2, 20)) throw new Error('sort: потрібно від 2 до 20 елементів (items)')
      const len = (o['items'] as string[]).length
      if (!isPermutation(o['correctOrder'], len)) throw new Error(`sort: correctOrder має бути перестановкою індексів 0..${len - 1}`)
      if (correct != null) throw new Error('sort: correct має бути null')
      return { type, options: { items: o['items'], correctOrder: o['correctOrder'] }, correct: null }
    }
    case 'match': {
      const o = asObject(options)
      if (!o || !isStringList(o['left'], 1, 20)) throw new Error('match: потрібен лівий стовпець (left) від 1 до 20 елементів')
      if (!isStringList(o['right'], 1, 20)) throw new Error('match: потрібен правий стовпець (right) від 1 до 20 елементів')
      const leftLen = (o['left'] as string[]).length
      const rightLen = (o['right'] as string[]).length
      if (new Set(o['right'] as string[]).size !== rightLen) throw new Error('match: значення правого стовпця (right) мають бути унікальними')
      const pairs = asArray(o['pairs'])
      if (!pairs || pairs.length !== leftLen || !pairs.every(x => Number.isInteger(x) && (x as number) >= 0 && (x as number) < rightLen))
        throw new Error('match: pairs має містити по одному індексу правого стовпця для кожного лівого')
      if (correct != null) throw new Error('match: correct має бути null')
      return { type, options: { left: o['left'], right: o['right'], pairs: o['pairs'] }, correct: null }
    }
    case 'input': {
      const o = asObject(options)
      const answer = o?.['answer']
      if (answer == null || (typeof answer !== 'string' && typeof answer !== 'number') || String(answer).trim() === '')
        throw new Error('input: потрібна правильна відповідь (answer)')
      const inputType = o?.['inputType'] === 'number' ? 'number' : 'text'
      if (correct != null) throw new Error('input: correct має бути null')
      return { type, options: { answer, inputType }, correct: null }
    }
  }
}
