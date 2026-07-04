import { mountSortingGame } from './features/games/sorting-game.js'
import { SORTING_ATTRIBUTES_LEVELS } from './features/games/sorting-data.js'

const root = document.getElementById('sorting-game')
if (root) mountSortingGame(root, SORTING_ATTRIBUTES_LEVELS)
