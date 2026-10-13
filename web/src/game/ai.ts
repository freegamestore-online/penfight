import { clamp } from '../lib/canvas'
import type { Difficulty } from '../types'
import { cloneGame, flick, stepGame, STEP, type Game, type Phase, type PlayerIndex } from './rules'
import { gaussian, type Rng } from './rng'
import { edgeDistance } from './tables'

export interface Shot {
  angle: number
  power: number
}

interface Candidate extends Shot {
  score: number
}

const ANGLE_STEP = 0.05
const ANGLE_STEPS = 8
const POWERS = [0.35, 0.5, 0.65, 0.8, 0.9, 1]
const MAX_SIM_STEPS = 2400

const NOISE: Record<Difficulty, { angle: number; power: number }> = {
  easy: { angle: 0.18, power: 0.15 },
  medium: { angle: 0.06, power: 0.07 },
  hard: { angle: 0.015, power: 0.02 },
}

/** Plays a shot out on a copy of the game with the real physics and returns how it ended. */
export function simulateShot(g: Game, who: PlayerIndex, shot: Shot): { selfFell: boolean; oppFell: boolean; selfEdge: number; oppEdge: number } {
  const c = cloneGame(g)
  c.turn = who
  c.phase = 'aim'
  flick(c, shot.angle, shot.power)
  for (let i = 0; i < MAX_SIM_STEPS && (c.phase as Phase) === 'moving'; i++) stepGame(c, STEP)
  const opp: PlayerIndex = who === 0 ? 1 : 0
  const me = c.pens[who]
  const them = c.pens[opp]
  return {
    selfFell: me.fall > 0,
    oppFell: them.fall > 0,
    selfEdge: me.fall > 0 ? -1 : edgeDistance(c.table, c.inset, me.x, me.y),
    oppEdge: them.fall > 0 ? -1 : edgeDistance(c.table, c.inset, them.x, them.y),
  }
}

function scoreOutcome(o: ReturnType<typeof simulateShot>): number {
  if (o.oppFell && !o.selfFell) return 1000
  if (o.selfFell && !o.oppFell) return -1000
  if (o.selfFell && o.oppFell) return -500
  // Nobody fell: prefer leaving the opponent near an edge and staying safe myself.
  return o.selfEdge * 0.3 - o.oppEdge
}

/** Picks a shot for the player whose turn it is. Harder levels choose better shots and aim more precisely. */
export function chooseShot(g: Game, difficulty: Difficulty, rng: Rng): Shot {
  const who = g.turn
  const opp: PlayerIndex = who === 0 ? 1 : 0
  const me = g.pens[who]
  const them = g.pens[opp]
  const base = Math.atan2(them.y - me.y, them.x - me.x)

  const candidates: Candidate[] = []
  for (let k = -ANGLE_STEPS; k <= ANGLE_STEPS; k++) {
    for (const power of POWERS) {
      const shot = { angle: base + k * ANGLE_STEP, power }
      candidates.push({ ...shot, score: scoreOutcome(simulateShot(g, who, shot)) })
    }
  }
  candidates.sort((x, y) => y.score - x.score)

  let pick: Candidate
  if (difficulty === 'hard') {
    pick = candidates[0]!
  } else if (difficulty === 'medium') {
    pick = candidates[Math.floor(rng() * 3)]!
  } else if (rng() < 0.25) {
    pick = candidates[Math.floor(rng() * candidates.length)]!
  } else {
    pick = candidates[Math.floor(rng() * Math.ceil(candidates.length * 0.4))]!
  }

  const noise = NOISE[difficulty]
  return {
    angle: pick.angle + gaussian(rng) * noise.angle,
    power: clamp(pick.power + gaussian(rng) * noise.power, 0.2, 1),
  }
}
