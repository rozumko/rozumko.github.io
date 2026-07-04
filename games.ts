import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS, INFO_SORT_LEVELS, MULTISORT_LEVELS, type SortingLevel } from './features/games/sorting-data.js'

const GAMES: Record<string, SortingLevel[]> = {
  attributes: SORTING_ATTRIBUTES_LEVELS,
  infosort:   INFO_SORT_LEVELS,
  multisort:  MULTISORT_LEVELS,
}

const menu     = document.getElementById('games-menu')!
const gameArea = document.getElementById('game-area')!
const gameRoot = document.getElementById('sorting-game')!

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
