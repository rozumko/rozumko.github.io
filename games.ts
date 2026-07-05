import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS, INFO_SORT_LEVELS, MULTISORT_LEVELS, type SortingLevel } from './features/games/sorting-data.js'
import { mountPuzzles } from './features/games/puzzle-engine.js'

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

document.querySelectorAll<HTMLButtonElement>('.game-pick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
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
let puzzleGrade = 1

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
  highlightPuzzleGrade(puzzleGrade)
  mountPuzzles(puzzleRoot, puzzleGrade)
})

document.querySelectorAll<HTMLElement>('.puzzle-grade-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    puzzleGrade = Number(btn.dataset['grade'])
    highlightPuzzleGrade(puzzleGrade)
    mountPuzzles(puzzleRoot, puzzleGrade)
  })
})

document.getElementById('puzzle-back-btn')!.addEventListener('click', () => {
  puzzleArea.classList.add('hidden')
  puzzleRoot.innerHTML = ''
  menu.classList.remove('hidden')
})
