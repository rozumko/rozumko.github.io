import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS, INFO_SORT_LEVELS, MULTISORT_LEVELS, type SortingLevel } from './features/games/sorting-data.js'
import { mountPuzzles } from './features/games/puzzle-engine.js'
import { getSavedGrade, saveGrade } from './utils/grade.js'

const GAMES: Record<string, SortingLevel[]> = {
  attributes: SORTING_ATTRIBUTES_LEVELS,
  infosort:   INFO_SORT_LEVELS,
  multisort:  MULTISORT_LEVELS,
}

const menu       = document.getElementById('games-menu')!
const gameArea   = document.getElementById('game-area')!
const gameRoot   = document.getElementById('sorting-game')!
const puzzleArea = document.getElementById('puzzle-area')!
const puzzleRoot = document.getElementById('puzzles-root')!

// Преміум-модалка: локнуті ігри показують CTA замість запуску (гейт лише
// візуальний — вдома користувач анонімний; реальне enforcement прийде з оплатою).
const premiumModal = document.getElementById('premium-modal')!
function openPremiumModal() { premiumModal.classList.remove('hidden') }
function closePremiumModal() { premiumModal.classList.add('hidden') }
document.getElementById('premium-close')!.addEventListener('click', closePremiumModal)
premiumModal.addEventListener('click', (e) => { if (e.target === premiumModal) closePremiumModal() })

document.querySelectorAll<HTMLButtonElement>('.game-pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset['locked']) { openPremiumModal(); return }
    const levels = GAMES[btn.dataset['game'] ?? '']
    if (!levels) return
    menu.classList.add('hidden')
    gameArea.classList.remove('hidden')
    mountSortingGame(gameRoot, levels)
  })
})

document.getElementById('game-back-btn')!.addEventListener('click', () => {
  gameArea.classList.add('hidden')
  gameRoot.innerHTML = ''
  menu.classList.remove('hidden')
})

// ── Логічні головоломки ──────────────────────────────────────────────────────
// Клас підхоплюємо з вибору на «Я вдома» (localStorage) — без повторного кліку.
let puzzleGrade = getSavedGrade()

function highlightPuzzleGrade(grade: number) {
  document.querySelectorAll<HTMLElement>('.puzzle-grade-btn').forEach(btn => {
    const active = Number(btn.dataset['grade']) === grade
    btn.setAttribute('aria-pressed', String(active))
    btn.style.outline = active ? '3px solid #3b82f6' : ''
    btn.style.outlineOffset = active ? '2px' : ''
  })
}

document.getElementById('puzzles-pick-btn')!.addEventListener('click', () => {
  menu.classList.add('hidden')
  puzzleArea.classList.remove('hidden')
  document.body.classList.add('puzzle-active')   // fixed-оверлей: один екран без прокрутки
  highlightPuzzleGrade(puzzleGrade)
  mountPuzzles(puzzleRoot, puzzleGrade)
})

document.querySelectorAll<HTMLElement>('.puzzle-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    puzzleGrade = Number(btn.dataset['grade'])
    saveGrade(puzzleGrade)
    highlightPuzzleGrade(puzzleGrade)
    mountPuzzles(puzzleRoot, puzzleGrade)
  })
})

document.getElementById('puzzle-back-btn')!.addEventListener('click', () => {
  puzzleArea.classList.add('hidden')
  document.body.classList.remove('puzzle-active')
  puzzleRoot.innerHTML = ''
  menu.classList.remove('hidden')
})
