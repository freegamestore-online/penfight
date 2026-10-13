import type { BestOf, Difficulty, MatchConfig, PlayerMode, Stats, TableId } from '../types'

// Everything Pen Fight keeps in the browser lives under these two keys. Nothing leaves the device.
const STATS_KEY = 'penfight:v1:stats'
const CONFIG_KEY = 'penfight:v1:config'

export const DEFAULT_STATS: Stats = { cpuWins: 0, cpuLosses: 0, streak: 0, bestStreak: 0, localMatches: 0, roundsPlayed: 0 }
export const DEFAULT_CONFIG: MatchConfig = { mode: 'cpu', difficulty: 'medium', bestOf: 3, table: 'classic' }

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0)
const oneOf = <T extends string | number>(v: unknown, options: readonly T[], fallback: T): T =>
  options.includes(v as T) ? (v as T) : fallback

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? null : JSON.parse(raw)
  } catch {
    return null
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be blocked (private mode, full disk). The game still plays; stats just are not kept.
  }
}

export function parseStats(raw: unknown): Stats {
  if (!isObject(raw)) return { ...DEFAULT_STATS }
  return {
    cpuWins: count(raw.cpuWins),
    cpuLosses: count(raw.cpuLosses),
    streak: count(raw.streak),
    bestStreak: count(raw.bestStreak),
    localMatches: count(raw.localMatches),
    roundsPlayed: count(raw.roundsPlayed),
  }
}

export function parseConfig(raw: unknown): MatchConfig {
  if (!isObject(raw)) return { ...DEFAULT_CONFIG }
  return {
    mode: oneOf<PlayerMode>(raw.mode, ['local', 'cpu'], DEFAULT_CONFIG.mode),
    difficulty: oneOf<Difficulty>(raw.difficulty, ['easy', 'medium', 'hard'], DEFAULT_CONFIG.difficulty),
    bestOf: oneOf<BestOf>(raw.bestOf, [1, 3, 5], DEFAULT_CONFIG.bestOf),
    table: oneOf<TableId>(raw.table, ['classic', 'ledge', 'round'], DEFAULT_CONFIG.table),
  }
}

export const loadStats = (): Stats => parseStats(read(STATS_KEY))
export const saveStats = (s: Stats): void => write(STATS_KEY, s)
export const loadConfig = (): MatchConfig => parseConfig(read(CONFIG_KEY))
export const saveConfig = (c: MatchConfig): void => write(CONFIG_KEY, c)

export function resetStats(): Stats {
  try {
    window.localStorage.removeItem(STATS_KEY)
  } catch {
    // Nothing stored that we could remove.
  }
  return { ...DEFAULT_STATS }
}

/** Folds a finished match into the stats. Player 1 is the human in a CPU match. */
export function recordMatch(stats: Stats, result: { mode: PlayerMode; winner: 0 | 1; rounds: number }): Stats {
  const next = { ...stats, roundsPlayed: stats.roundsPlayed + result.rounds }
  if (result.mode === 'local') {
    next.localMatches += 1
    return next
  }
  if (result.winner === 0) {
    next.cpuWins += 1
    next.streak += 1
    next.bestStreak = Math.max(next.bestStreak, next.streak)
  } else {
    next.cpuLosses += 1
    next.streak = 0
  }
  return next
}
