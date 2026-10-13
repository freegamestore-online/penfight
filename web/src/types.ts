export type PlayerMode = 'local' | 'cpu'
export type Difficulty = 'easy' | 'medium' | 'hard'
export type TableId = 'classic' | 'ledge' | 'round'
export type BestOf = 1 | 3 | 5

export interface MatchConfig {
  mode: PlayerMode
  difficulty: Difficulty
  bestOf: BestOf
  table: TableId
}

export interface Stats {
  cpuWins: number
  cpuLosses: number
  streak: number
  bestStreak: number
  localMatches: number
  roundsPlayed: number
}

/** What the topbar and status line need to know about the running match. */
export interface Hud {
  wins: [number, number]
  round: number
  turn: 0 | 1
  phase: 'aim' | 'moving' | 'roundOver' | 'matchOver'
  suddenDeath: boolean
}
