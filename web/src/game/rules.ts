import type { BestOf, MatchConfig } from '../types'
import { clamp } from '../lib/canvas'
import { isOnTable, maxInset, PEN_RADIUS, spawnPositions, TABLES, type TableDef } from './tables'

/** Fixed physics step. The game loop accumulates real time and runs whole steps, so play is identical at 60 and 144 Hz. */
export const STEP = 1 / 120
export const MAX_SPEED = 1100
/** Turns (flicks) in a round before the table starts shrinking. */
export const SUDDEN_DEATH_AFTER = 10

const DAMPING = 1.9
const COULOMB = 55
const STOP_SPEED = 8
const RESTITUTION = 0.9
const FALL_TIME = 0.7
const FALL_DRAG = 0.6
const SHRINK_STEP = 18
const MOVE_TIMEOUT = 15
const HEADING_MIN_SPEED = 40

export type Phase = 'aim' | 'moving' | 'roundOver' | 'matchOver'
export type PlayerIndex = 0 | 1

export interface Pen {
  x: number
  y: number
  vx: number
  vy: number
  heading: number
  /** 0 while on the table; seconds spent falling once it has gone over the edge. */
  fall: number
}

export interface Game {
  config: MatchConfig
  table: TableDef
  pens: [Pen, Pen]
  turn: PlayerIndex
  phase: Phase
  /** Flicks taken this round. */
  turnCount: number
  /** How far the playable area has shrunk in from every edge. */
  inset: number
  shrunk: boolean
  moveTime: number
  wins: [number, number]
  round: number
  roundWinner: PlayerIndex | 'draw' | null
  matchWinner: PlayerIndex | null
  starter: PlayerIndex
}

export type GameEvent =
  | { type: 'collision'; speed: number; x: number; y: number }
  | { type: 'fall'; pen: PlayerIndex }
  | { type: 'shrink' }
  | { type: 'turn'; turn: PlayerIndex }
  | { type: 'roundOver'; winner: PlayerIndex | 'draw' }
  | { type: 'matchOver'; winner: PlayerIndex }

export function winsNeeded(bestOf: BestOf): number {
  return Math.ceil(bestOf / 2)
}

function newPen(x: number, y: number, heading: number): Pen {
  return { x, y, vx: 0, vy: 0, heading, fall: 0 }
}

export function createGame(config: MatchConfig): Game {
  const table = TABLES[config.table]
  const [a, b] = spawnPositions(table)
  return {
    config,
    table,
    pens: [newPen(a.x, a.y, 0), newPen(b.x, b.y, Math.PI)],
    turn: 0,
    phase: 'aim',
    turnCount: 0,
    inset: 0,
    shrunk: false,
    moveTime: 0,
    wins: [0, 0],
    round: 1,
    roundWinner: null,
    matchWinner: null,
    starter: 0,
  }
}

/** Puts both pens back at their start positions and begins a fresh round. */
export function startRound(g: Game): void {
  const [a, b] = spawnPositions(g.table)
  g.pens = [newPen(a.x, a.y, 0), newPen(b.x, b.y, Math.PI)]
  g.turn = g.starter
  g.phase = 'aim'
  g.turnCount = 0
  g.inset = 0
  g.shrunk = false
  g.moveTime = 0
  g.roundWinner = null
}

/** Advances to the next round. A drawn round is replayed with the same round number. */
export function nextRound(g: Game): void {
  if (g.phase !== 'roundOver') return
  if (g.roundWinner !== 'draw') g.round += 1
  g.starter = g.starter === 0 ? 1 : 0
  startRound(g)
}

export function cloneGame(g: Game): Game {
  return {
    ...g,
    config: g.config,
    pens: [{ ...g.pens[0] }, { ...g.pens[1] }],
    wins: [g.wins[0], g.wins[1]],
  }
}

/** Flicks the active player's pen. `power` is 0..1. Returns false if a flick is not allowed right now. */
export function flick(g: Game, angle: number, power: number): boolean {
  if (g.phase !== 'aim') return false
  const p = clamp(power, 0, 1)
  if (p < 0.05) return false
  const pen = g.pens[g.turn]
  const speed = MAX_SPEED * p
  pen.vx = Math.cos(angle) * speed
  pen.vy = Math.sin(angle) * speed
  pen.heading = angle
  g.phase = 'moving'
  g.moveTime = 0
  g.turnCount += 1
  g.shrunk = false
  return true
}

function speedOf(p: Pen): number {
  return Math.hypot(p.vx, p.vy)
}

function damp(p: Pen, dt: number): void {
  const s = speedOf(p)
  if (s === 0) return
  let next = s * Math.exp(-DAMPING * dt) - COULOMB * dt
  if (next < 4) next = 0
  const k = next / s
  p.vx *= k
  p.vy *= k
}

function integrate(g: Game, dt: number, events: GameEvent[]): void {
  for (const p of g.pens) {
    if (p.fall > 0) {
      p.fall += dt
      const k = Math.exp(-FALL_DRAG * dt)
      p.vx *= k
      p.vy *= k
    } else {
      damp(p, dt)
    }
    p.x += p.vx * dt
    p.y += p.vy * dt
  }

  const [a, b] = g.pens
  if (a.fall === 0 && b.fall === 0) {
    let dx = b.x - a.x
    let dy = b.y - a.y
    let d = Math.hypot(dx, dy)
    const min = PEN_RADIUS * 2
    if (d < min) {
      if (d < 1e-6) {
        dx = 1
        dy = 0
        d = 1
      }
      const nx = dx / d
      const ny = dy / d
      const overlap = min - d
      a.x -= (nx * overlap) / 2
      a.y -= (ny * overlap) / 2
      b.x += (nx * overlap) / 2
      b.y += (ny * overlap) / 2
      const approach = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny
      if (approach > 0) {
        // Equal masses: exchange the normal component of velocity, scaled by restitution.
        const j = ((1 + RESTITUTION) * approach) / 2
        a.vx -= j * nx
        a.vy -= j * ny
        b.vx += j * nx
        b.vy += j * ny
        events.push({ type: 'collision', speed: approach, x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })
      }
    }
  }

  for (const i of [0, 1] as const) {
    const p = g.pens[i]
    if (p.fall === 0 && !isOnTable(g.table, g.inset, p.x, p.y)) {
      p.fall = 1e-6
      events.push({ type: 'fall', pen: i })
    }
    const s = speedOf(p)
    if (p.fall === 0 && s > HEADING_MIN_SPEED) p.heading = Math.atan2(p.vy, p.vx)
  }
}

function settled(g: Game): boolean {
  return g.pens.every((p) => (p.fall > 0 ? p.fall >= FALL_TIME : speedOf(p) < STOP_SPEED))
}

function stopPens(g: Game): void {
  for (const p of g.pens) {
    if (p.fall === 0) {
      p.vx = 0
      p.vy = 0
    }
  }
}

function endRound(g: Game, winner: PlayerIndex | 'draw', events: GameEvent[]): void {
  g.roundWinner = winner
  g.phase = 'roundOver'
  events.push({ type: 'roundOver', winner })
  if (winner === 'draw') return
  g.wins[winner] += 1
  if (g.wins[winner] >= winsNeeded(g.config.bestOf)) {
    g.matchWinner = winner
    g.phase = 'matchOver'
    events.push({ type: 'matchOver', winner })
  }
}

function switchTurn(g: Game, events: GameEvent[]): void {
  g.turn = g.turn === 0 ? 1 : 0
  g.phase = 'aim'
  events.push({ type: 'turn', turn: g.turn })
}

function resolveTurn(g: Game, events: GameEvent[]): void {
  stopPens(g)
  const fell0 = g.pens[0].fall > 0
  const fell1 = g.pens[1].fall > 0
  if (fell0 && fell1) return endRound(g, 'draw', events)
  if (fell0) return endRound(g, 1, events)
  if (fell1) return endRound(g, 0, events)

  if (g.turnCount >= SUDDEN_DEATH_AFTER && !g.shrunk) {
    g.shrunk = true
    g.inset = Math.min(maxInset(g.table), g.inset + SHRINK_STEP)
    events.push({ type: 'shrink' })
    let anyFell = false
    for (const i of [0, 1] as const) {
      const p = g.pens[i]
      if (!isOnTable(g.table, g.inset, p.x, p.y)) {
        p.fall = 1e-6
        anyFell = true
        events.push({ type: 'fall', pen: i })
      }
    }
    // Pens swept off by the shrinking table finish falling, then the round is decided on the next settle.
    if (anyFell) return
  }
  switchTurn(g, events)
}

/** Advances physics by `dt` seconds and applies the rules. Call with a fixed step. */
export function stepGame(g: Game, dt: number, events: GameEvent[] = []): GameEvent[] {
  if (g.phase === 'aim') return events
  integrate(g, dt, events)
  if (g.phase !== 'moving') return events
  g.moveTime += dt
  if (g.moveTime < MOVE_TIMEOUT && !settled(g)) return events
  resolveTurn(g, events)
  return events
}
