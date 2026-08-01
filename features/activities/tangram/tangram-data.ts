export type TangramFamily = 'large' | 'medium' | 'small' | 'square' | 'parallelogram'

export interface TangramPieceDefinition {
  id: string
  family: TangramFamily
  name: string
  color: string
  points: string
}

export interface TangramTarget {
  id: string
  family: TangramFamily
  x: number
  y: number
  angle: number
  flipped?: boolean
}

export interface TangramPuzzle {
  id: string
  name: string
  targets: readonly TangramTarget[]
}

export const TANGRAM_PIECES: readonly TangramPieceDefinition[] = [
  { id: 'large-a', family: 'large', name: 'великий трикутник', color: '#fb7185', points: '-100,-50 100,-50 0,50' },
  { id: 'large-b', family: 'large', name: 'великий трикутник', color: '#2dd4bf', points: '-100,-50 100,-50 0,50' },
  { id: 'medium', family: 'medium', name: 'середній трикутник', color: '#38bdf8', points: '-50,-50 50,50 -50,50' },
  { id: 'small-a', family: 'small', name: 'малий трикутник', color: '#facc15', points: '-50,0 50,0 0,50' },
  { id: 'small-b', family: 'small', name: 'малий трикутник', color: '#fb923c', points: '-50,0 50,0 0,50' },
  { id: 'square', family: 'square', name: 'квадрат', color: '#4ade80', points: '-50,0 0,-50 50,0 0,50' },
  { id: 'parallelogram', family: 'parallelogram', name: 'паралелограм', color: '#c084fc', points: '-75,-25 25,-25 75,25 -25,25' },
]

export const TANGRAM_PUZZLES: readonly TangramPuzzle[] = [
  {
    id: 'kite',
    name: 'Повітряний змій',
    targets: [
      { id: 'kite-large-top', family: 'large', x: 600, y: 90, angle: 180 },
      { id: 'kite-large-bottom', family: 'large', x: 600, y: 190, angle: 0 },
      { id: 'kite-medium', family: 'medium', x: 750, y: 170, angle: 0 },
      { id: 'kite-square', family: 'square', x: 600, y: 290, angle: 0 },
      { id: 'kite-small-left', family: 'small', x: 550, y: 390, angle: 0 },
      { id: 'kite-small-right', family: 'small', x: 650, y: 390, angle: 0 },
      { id: 'kite-tail', family: 'parallelogram', x: 775, y: 345, angle: 0, flipped: true },
    ],
  },
  {
    id: 'rocket',
    name: 'Ракета',
    targets: [
      { id: 'rocket-large-left', family: 'large', x: 570, y: 205, angle: 90 },
      { id: 'rocket-large-right', family: 'large', x: 670, y: 205, angle: 270 },
      { id: 'rocket-medium', family: 'medium', x: 620, y: 75, angle: 225 },
      { id: 'rocket-square', family: 'square', x: 620, y: 315, angle: 0 },
      { id: 'rocket-small-left', family: 'small', x: 535, y: 395, angle: 315 },
      { id: 'rocket-small-right', family: 'small', x: 705, y: 395, angle: 45 },
      { id: 'rocket-flame', family: 'parallelogram', x: 620, y: 455, angle: 0, flipped: true },
    ],
  },
  {
    id: 'bird',
    name: 'Пташка',
    targets: [
      { id: 'bird-large-left', family: 'large', x: 555, y: 245, angle: 315 },
      { id: 'bird-large-right', family: 'large', x: 690, y: 245, angle: 45 },
      { id: 'bird-medium', family: 'medium', x: 760, y: 155, angle: 90 },
      { id: 'bird-square', family: 'square', x: 625, y: 330, angle: 45 },
      { id: 'bird-small-head', family: 'small', x: 805, y: 245, angle: 270 },
      { id: 'bird-small-tail', family: 'small', x: 445, y: 215, angle: 90 },
      { id: 'bird-wing', family: 'parallelogram', x: 625, y: 125, angle: 45, flipped: true },
    ],
  },
]

