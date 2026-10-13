import { describe, expect, it } from 'vitest'
import { recordMatch, DEFAULT_STATS, parseConfig, parseStats } from '../services/storage'
import type { MatchConfig } from '../types'
import { chooseShot, simulateShot } from './ai'
import { mulberry32 } from './rng'
import {
  cloneGame,
  createGame,
  flick,
  nextRound,
  startRound,
  stepGame,
  STEP,
  SUDDEN_DEATH_AFTER,
  winsNeeded,
  type Game,
  type GameEvent,
} from './rules'
import { edgeDistance, isOnTable, PEN_RADIUS, TABLES } from './tables'

const config = (patch: Partial<MatchConfig> = {}): MatchConfig => ({ mode: 'local', difficulty: 'medium', bestOf: 3, table: 'classic', ...patch })

/** Runs the physics until the current flick has fully resolved. */
function settle(g: Game, maxSteps = 4000): GameEvent[] {
  const events: GameEvent[] = []
  for (let i = 0; i < maxSteps && g.phase === 'moving'; i++) stepGame(g, STEP, events)
  return events
}

describe('tables', () => {
  it('detects the edge on every table', () => {
    for (const t of Object.values(TABLES)) {
      expect(isOnTable(t, 0, t.width / 2, t.height / 2)).toBe(true)
      expect(isOnTable(t, 0, -5, t.height / 2)).toBe(false)
      expect(isOnTable(t, 0, t.width + 5, t.height / 2)).toBe(false)
    }
    expect(edgeDistance(TABLES.classic, 0, 100, 250)).toBe(100)
    expect(edgeDistance(TABLES.round, 0, 260, 260)).toBe(260)
  })

  it('treats shrinking as moving the edge inwards', () => {
    expect(isOnTable(TABLES.classic, 0, 10, 250)).toBe(true)
    expect(isOnTable(TABLES.classic, 20, 10, 250)).toBe(false)
  })
})

describe('physics', () => {
  it('a flicked pen slows down and stops on its own', () => {
    const g = createGame(config())
    expect(flick(g, Math.PI / 2, 0.5)).toBe(true) // sideways along the table
    const events = settle(g)
    expect(events.some((e) => e.type === 'turn')).toBe(true)
    expect(g.pens[0].vx).toBe(0)
    expect(g.pens[0].vy).toBe(0)
    expect(g.pens[0].y).toBeGreaterThan(250)
  })

  it('more power travels further', () => {
    const run = (power: number) => {
      const g = createGame(config({ table: 'round' }))
      flick(g, -Math.PI / 2, power)
      settle(g)
      return Math.hypot(g.pens[0].x - 110, g.pens[0].y - 260)
    }
    expect(run(0.3)).toBeLessThan(run(0.5))
    expect(run(0.5)).toBeLessThan(run(0.7))
  })

  it('a head-on hit passes momentum to the other pen', () => {
    const g = createGame(config())
    g.pens[0].x = 300
    g.pens[1].x = 300 + PEN_RADIUS * 2 + 40
    const before = g.pens[1].x
    flick(g, 0, 0.5)
    const events = settle(g)
    expect(events.some((e) => e.type === 'collision')).toBe(true)
    expect(g.pens[1].x).toBeGreaterThan(before + 20)
    // The attacker gives up most of its speed.
    expect(g.pens[0].x).toBeLessThan(g.pens[1].x)
  })

  it('never leaves pens overlapping after a collision', () => {
    const g = createGame(config())
    g.pens[0].x = 300
    g.pens[1].x = 300 + PEN_RADIUS * 2 + 10
    flick(g, 0.1, 0.8)
    settle(g)
    if (g.pens[0].fall === 0 && g.pens[1].fall === 0) {
      expect(Math.hypot(g.pens[0].x - g.pens[1].x, g.pens[0].y - g.pens[1].y)).toBeGreaterThanOrEqual(PEN_RADIUS * 2 - 0.5)
    }
  })

  it('is deterministic for the same shot', () => {
    const a = createGame(config())
    const b = createGame(config())
    flick(a, 0.05, 0.9)
    flick(b, 0.05, 0.9)
    settle(a)
    settle(b)
    expect(a.pens[0]).toEqual(b.pens[0])
    expect(a.pens[1]).toEqual(b.pens[1])
  })
})

describe('rules', () => {
  it('ignores a flick while pens are moving or with no power', () => {
    const g = createGame(config())
    expect(flick(g, 0, 0.01)).toBe(false)
    expect(flick(g, 0, 0.5)).toBe(true)
    expect(flick(g, 0, 0.5)).toBe(false)
  })

  it('alternates turns after a flick that knocks nobody off', () => {
    const g = createGame(config())
    flick(g, Math.PI / 2, 0.3)
    settle(g)
    expect(g.phase).toBe('aim')
    expect(g.turn).toBe(1)
  })

  it('knocking the opponent off wins the round', () => {
    const g = createGame(config({ bestOf: 3 }))
    g.pens[1].x = 740
    g.pens[0].x = 690
    flick(g, 0, 1)
    const events = settle(g)
    expect(g.roundWinner).toBe(0)
    expect(g.wins).toEqual([1, 0])
    expect(g.phase).toBe('roundOver')
    expect(events.some((e) => e.type === 'fall' && e.pen === 1)).toBe(true)
  })

  it('flicking your own pen off the table loses the round', () => {
    const g = createGame(config())
    g.pens[0].x = 50
    flick(g, Math.PI, 1)
    settle(g)
    expect(g.roundWinner).toBe(1)
  })

  it('both pens falling is a draw that replays the round', () => {
    const g = createGame(config())
    g.pens[0].x = 60
    g.pens[1].x = 60 + PEN_RADIUS * 2 + 5
    g.pens[1].y = 250
    g.pens[0].y = 250
    flick(g, 0, 1)
    // Fire pen 0 into pen 1 near the left edge, pushing both... force the draw directly.
    g.pens[0].fall = 0.0001
    g.pens[1].fall = 0.0001
    settle(g)
    expect(g.roundWinner).toBe('draw')
    expect(g.wins).toEqual([0, 0])
    nextRound(g)
    expect(g.round).toBe(1)
    expect(g.phase).toBe('aim')
  })

  it('wins the match at the required number of rounds and alternates the starter', () => {
    expect(winsNeeded(1)).toBe(1)
    expect(winsNeeded(3)).toBe(2)
    expect(winsNeeded(5)).toBe(3)

    const g = createGame(config({ bestOf: 3 }))
    const knockOut = (who: 0 | 1) => {
      g.turn = who
      const other = who === 0 ? 1 : 0
      g.pens[who].x = who === 0 ? 690 : 110
      g.pens[other].x = who === 0 ? 740 : 60
      flick(g, who === 0 ? 0 : Math.PI, 1)
      settle(g)
    }
    knockOut(0)
    expect(g.phase).toBe('roundOver')
    nextRound(g)
    expect(g.round).toBe(2)
    expect(g.turn).toBe(1)
    knockOut(0)
    expect(g.matchWinner).toBe(0)
    expect(g.phase).toBe('matchOver')
  })

  it('shrinks the table in sudden death and sweeps edge-hugging pens off', () => {
    const g = createGame(config({ table: 'classic' }))
    g.turnCount = SUDDEN_DEATH_AFTER - 1
    g.pens[1].x = 6 // inside the table but within the first shrink band
    flick(g, Math.PI / 2, 0.2)
    const events = settle(g, 6000)
    expect(events.some((e) => e.type === 'shrink')).toBe(true)
    expect(g.inset).toBeGreaterThan(0)
    expect(g.roundWinner).toBe(0)
  })

  it('startRound resets the board', () => {
    const g = createGame(config())
    g.pens[0].x = 1
    g.inset = 30
    g.turnCount = 8
    startRound(g)
    expect(g.inset).toBe(0)
    expect(g.turnCount).toBe(0)
    expect(g.pens[0].x).toBe(TABLES.classic.width * 0.22)
  })

  it('cloneGame does not share pen state', () => {
    const g = createGame(config())
    const c = cloneGame(g)
    c.pens[0].x = 999
    expect(g.pens[0].x).not.toBe(999)
  })
})

describe('CPU opponent', () => {
  it('simulating a shot leaves the real game untouched', () => {
    const g = createGame(config())
    const before = JSON.stringify(g)
    simulateShot(g, 0, { angle: 0, power: 0.8 })
    expect(JSON.stringify(g)).toBe(before)
  })

  it('the hard CPU does not knock itself off from the opening position', () => {
    for (const table of ['classic', 'ledge', 'round'] as const) {
      for (let seed = 1; seed <= 6; seed++) {
        const g = createGame(config({ mode: 'cpu', table }))
        g.turn = 1
        const shot = chooseShot(g, 'hard', mulberry32(seed))
        expect(simulateShot(g, 1, shot).selfFell).toBe(false)
      }
    }
  })

  it('the hard CPU finds a knockout when the human pen is on the edge', () => {
    const g = createGame(config({ mode: 'cpu' }))
    g.turn = 1
    g.pens[0].x = 90
    g.pens[1].x = 300
    const shot = chooseShot(g, 'hard', mulberry32(3))
    expect(simulateShot(g, 1, shot).oppFell).toBe(true)
  })

  it('returns shots in a usable range at every difficulty', () => {
    const g = createGame(config({ mode: 'cpu' }))
    g.turn = 1
    for (const d of ['easy', 'medium', 'hard'] as const) {
      for (let seed = 1; seed <= 5; seed++) {
        const s = chooseShot(g, d, mulberry32(seed))
        expect(s.power).toBeGreaterThanOrEqual(0.2)
        expect(s.power).toBeLessThanOrEqual(1)
        expect(Number.isFinite(s.angle)).toBe(true)
      }
    }
  })
})

describe('stats and config storage', () => {
  it('records CPU wins, losses and streaks', () => {
    let s = DEFAULT_STATS
    s = recordMatch(s, { mode: 'cpu', winner: 0, rounds: 2 })
    s = recordMatch(s, { mode: 'cpu', winner: 0, rounds: 3 })
    expect(s).toMatchObject({ cpuWins: 2, streak: 2, bestStreak: 2, roundsPlayed: 5 })
    s = recordMatch(s, { mode: 'cpu', winner: 1, rounds: 2 })
    expect(s).toMatchObject({ cpuLosses: 1, streak: 0, bestStreak: 2 })
  })

  it('counts pass-and-play matches without touching CPU stats', () => {
    const s = recordMatch(DEFAULT_STATS, { mode: 'local', winner: 1, rounds: 2 })
    expect(s).toMatchObject({ localMatches: 1, cpuWins: 0, cpuLosses: 0, roundsPlayed: 2 })
  })

  it('repairs bad stored data instead of crashing', () => {
    expect(parseStats('nope')).toEqual(DEFAULT_STATS)
    expect(parseStats({ cpuWins: -4, cpuLosses: 'x', streak: 2.9 })).toMatchObject({ cpuWins: 0, cpuLosses: 0, streak: 2 })
    expect(parseConfig({ mode: 'bogus', bestOf: 4, table: 'round' })).toEqual({ mode: 'cpu', difficulty: 'medium', bestOf: 3, table: 'round' })
  })
})
