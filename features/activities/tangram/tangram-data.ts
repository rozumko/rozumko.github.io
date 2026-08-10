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
    id: 'cat-left',
    name: 'Котик дивиться ліворуч',
    targets: [
      { id: 'cat-left-body-lower', family: 'large', x: 600, y: 260, angle: 0 },
      { id: 'cat-left-body-upper', family: 'large', x: 600, y: 160, angle: 180 },
      { id: 'cat-left-head', family: 'square', x: 550, y: 110, angle: 0 },
      { id: 'cat-left-ear-a', family: 'small', x: 500, y: 60, angle: 270 },
      { id: 'cat-left-ear-b', family: 'small', x: 600, y: 60, angle: 0 },
      { id: 'cat-left-haunch', family: 'medium', x: 650, y: 260, angle: 270 },
      { id: 'cat-left-tail', family: 'parallelogram', x: 725, y: 235, angle: 90 },
    ],
  },
  {
    id: 'cat-right',
    name: 'Котик дивиться праворуч',
    targets: [
      { id: 'cat-right-body-lower', family: 'large', x: 600, y: 260, angle: 0 },
      { id: 'cat-right-body-upper', family: 'large', x: 600, y: 160, angle: 180 },
      { id: 'cat-right-head', family: 'square', x: 650, y: 110, angle: 0 },
      { id: 'cat-right-ear-a', family: 'small', x: 700, y: 60, angle: 90 },
      { id: 'cat-right-ear-b', family: 'small', x: 600, y: 60, angle: 0 },
      { id: 'cat-right-haunch', family: 'medium', x: 550, y: 260, angle: 0 },
      { id: 'cat-right-tail', family: 'parallelogram', x: 475, y: 235, angle: 90, flipped: true },
    ],
  },
  {
    id: 'cat-running',
    name: 'Котик біжить',
    targets: [
      { id: 'cat-running-body-a', family: 'large', x: 600, y: 260, angle: 0 },
      { id: 'cat-running-body-b', family: 'large', x: 650, y: 310, angle: 90 },
      { id: 'cat-running-head', family: 'square', x: 735.355339059, y: 245.355339059, angle: 45 },
      { id: 'cat-running-ear', family: 'small', x: 735.355339059, y: 174.644660941, angle: 45 },
      { id: 'cat-running-muzzle', family: 'small', x: 806.066017178, y: 245.355339059, angle: 135 },
      { id: 'cat-running-haunch', family: 'medium', x: 550, y: 260, angle: 0 },
      { id: 'cat-running-tail', family: 'parallelogram', x: 475, y: 285, angle: 90 },
    ],
  },
]

