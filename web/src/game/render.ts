import { clamp } from '../lib/canvas'
import type { Game, Pen, PlayerIndex } from './rules'
import type { TableDef } from './tables'
import { PEN_RADIUS } from './tables'

export interface View {
  /** Canvas size in CSS pixels. */
  cw: number
  ch: number
  dpr: number
  /** Table units to CSS pixels. */
  scale: number
  ox: number
  oy: number
  /** In a portrait container a landscape table is turned a quarter turn so it fills the screen. */
  rotated: boolean
  tableW: number
  tableH: number
}

export interface Spark {
  x: number
  y: number
  vx: number
  vy: number
  life: number
}

export interface Fx {
  trails: [{ x: number; y: number }[], { x: number; y: number }[]]
  sparks: Spark[]
  shake: number
  time: number
}

export interface AimState {
  active: boolean
  angle: number
  power: number
}

export interface Palette {
  ink: string
  muted: string
}

export const PEN_COLORS: [string, string] = ['#2563eb', '#e11d48']
const PEN_LENGTH = PEN_RADIUS * 2.3
const PEN_WIDTH = 15
const FALL_SECONDS = 0.7
const TRAIL_LENGTH = 22

export function newFx(): Fx {
  return { trails: [[], []], sparks: [], shake: 0, time: 0 }
}

export function computeView(table: TableDef, cw: number, ch: number, dpr: number): View {
  const rotated = ch > cw && table.width > table.height
  const rw = rotated ? table.height : table.width
  const rh = rotated ? table.width : table.height
  const pad = 12
  const scale = Math.max(0.05, Math.min((cw - pad * 2) / rw, (ch - pad * 2) / rh))
  return {
    cw,
    ch,
    dpr,
    scale,
    ox: (cw - rw * scale) / 2,
    oy: (ch - rh * scale) / 2,
    rotated,
    tableW: table.width,
    tableH: table.height,
  }
}

/** CSS pixel position on the canvas to table units. */
export function screenToWorld(v: View, px: number, py: number): { x: number; y: number } {
  const u = (px - v.ox) / v.scale
  const w = (py - v.oy) / v.scale
  return v.rotated ? { x: w, y: v.tableH - u } : { x: u, y: w }
}

/** Advances trails, sparks and shake. Pure bookkeeping, no drawing. */
export function updateFx(fx: Fx, g: Game, dt: number): void {
  fx.time += dt
  fx.shake = Math.max(0, fx.shake - dt * 30)
  for (const i of [0, 1] as const) {
    const pen = g.pens[i]
    const trail = fx.trails[i]
    if (pen.fall === 0 && Math.hypot(pen.vx, pen.vy) > 140) {
      trail.push({ x: pen.x, y: pen.y })
      if (trail.length > TRAIL_LENGTH) trail.shift()
    } else if (trail.length > 0) {
      trail.shift()
    }
  }
  for (const s of fx.sparks) {
    s.x += s.vx * dt
    s.y += s.vy * dt
    s.life -= dt
  }
  fx.sparks = fx.sparks.filter((s) => s.life > 0)
}

export function addImpact(fx: Fx, x: number, y: number, speed: number, reducedMotion: boolean): void {
  if (reducedMotion) return
  fx.shake = Math.min(7, fx.shake + speed / 120)
  const n = Math.min(14, 4 + Math.floor(speed / 80))
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 80 + Math.random() * 180
    fx.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.3 + Math.random() * 0.25 })
  }
}

function tablePath(ctx: CanvasRenderingContext2D, t: TableDef, inset: number): void {
  if (t.shape === 'round') {
    ctx.arc(t.width / 2, t.height / 2, t.width / 2 - inset, 0, Math.PI * 2)
  } else {
    ctx.roundRect(inset, inset, t.width - inset * 2, t.height - inset * 2, 18)
  }
}

const SURFACE: Record<TableDef['id'], { top: string; edge: string; grain: string }> = {
  classic: { top: '#c9a26b', edge: '#8a6535', grain: 'rgba(90,60,25,0.13)' },
  ledge: { top: '#9aa3ad', edge: '#5b636c', grain: 'rgba(255,255,255,0.12)' },
  round: { top: '#6aa57f', edge: '#3d6b50', grain: 'rgba(255,255,255,0.1)' },
}

function drawTable(ctx: CanvasRenderingContext2D, t: TableDef, inset: number): void {
  const c = SURFACE[t.id]
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,0.3)'
  ctx.shadowBlur = 24
  ctx.shadowOffsetY = 8
  ctx.beginPath()
  tablePath(ctx, t, 0)
  ctx.fillStyle = c.top
  ctx.fill()
  ctx.restore()

  ctx.save()
  ctx.beginPath()
  tablePath(ctx, t, 0)
  ctx.clip()
  ctx.strokeStyle = c.grain
  ctx.lineWidth = 2
  for (let y = 14; y < t.height; y += 22) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.bezierCurveTo(t.width * 0.3, y - 6, t.width * 0.6, y + 7, t.width, y - 2)
    ctx.stroke()
  }
  if (inset > 0) {
    // The part of the table that has gone: darkened, with a warning edge where the new boundary is.
    ctx.beginPath()
    tablePath(ctx, t, 0)
    tablePath(ctx, t, inset)
    ctx.fillStyle = 'rgba(20,12,6,0.55)'
    ctx.fill('evenodd')
  }
  ctx.restore()

  ctx.beginPath()
  tablePath(ctx, t, 0)
  ctx.lineWidth = 6
  ctx.strokeStyle = c.edge
  ctx.stroke()

  if (inset > 0) {
    ctx.beginPath()
    tablePath(ctx, t, inset)
    ctx.setLineDash([14, 10])
    ctx.lineWidth = 3
    ctx.strokeStyle = '#ef4444'
    ctx.stroke()
    ctx.setLineDash([])
  }
}

function drawPen(ctx: CanvasRenderingContext2D, pen: Pen, who: PlayerIndex): void {
  const fallT = pen.fall > 0 ? clamp(pen.fall / FALL_SECONDS, 0, 1) : 0
  ctx.save()
  ctx.translate(pen.x, pen.y)
  ctx.rotate(pen.heading)
  const s = 1 - fallT * 0.55
  ctx.scale(s, s)
  ctx.globalAlpha = 1 - fallT * fallT

  // Soft shadow under the pen.
  ctx.fillStyle = 'rgba(0,0,0,0.25)'
  ctx.beginPath()
  ctx.ellipse(2, 6, PEN_LENGTH / 2, PEN_WIDTH / 2, 0, 0, Math.PI * 2)
  ctx.fill()

  const color = PEN_COLORS[who]
  const half = PEN_LENGTH / 2
  ctx.beginPath()
  ctx.roundRect(-half, -PEN_WIDTH / 2, PEN_LENGTH, PEN_WIDTH, PEN_WIDTH / 2)
  ctx.fillStyle = color
  ctx.fill()

  // Player 1 has diagonal stripes and a round nib. Player 2 has dots and a pointed nib, so the pens differ without colour.
  ctx.save()
  ctx.clip()
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  if (who === 0) {
    ctx.lineWidth = 3
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    for (let x = -half + 6; x < half - 6; x += 10) {
      ctx.beginPath()
      ctx.moveTo(x, PEN_WIDTH / 2)
      ctx.lineTo(x + 6, -PEN_WIDTH / 2)
      ctx.stroke()
    }
  } else {
    for (let x = -half + 9; x < half - 9; x += 9) {
      ctx.beginPath()
      ctx.arc(x, 0, 2.2, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()

  ctx.fillStyle = '#1f2937'
  ctx.beginPath()
  if (who === 0) {
    ctx.arc(half + 1, 0, 5, 0, Math.PI * 2)
  } else {
    ctx.moveTo(half - 3, -PEN_WIDTH / 2 + 2)
    ctx.lineTo(half + 12, 0)
    ctx.lineTo(half - 3, PEN_WIDTH / 2 - 2)
  }
  ctx.fill()
  ctx.restore()
}

function drawAim(ctx: CanvasRenderingContext2D, g: Game, aim: AimState, time: number): void {
  const pen = g.pens[g.turn]
  const color = PEN_COLORS[g.turn]
  const pulse = 0.5 + 0.5 * Math.sin(time * 5)

  ctx.save()
  ctx.strokeStyle = color
  ctx.lineWidth = 3
  ctx.globalAlpha = 0.45 + pulse * 0.35
  ctx.beginPath()
  ctx.arc(pen.x, pen.y, PEN_RADIUS + 8, 0, Math.PI * 2)
  ctx.stroke()
  ctx.restore()

  if (!aim.active) return
  const len = 50 + aim.power * 230
  const dx = Math.cos(aim.angle)
  const dy = Math.sin(aim.angle)
  ctx.save()
  ctx.strokeStyle = color
  ctx.fillStyle = color
  ctx.lineCap = 'round'
  ctx.lineWidth = 4 + aim.power * 4
  ctx.setLineDash([2, 14])
  ctx.beginPath()
  ctx.moveTo(pen.x + dx * (PEN_RADIUS + 10), pen.y + dy * (PEN_RADIUS + 10))
  ctx.lineTo(pen.x + dx * len, pen.y + dy * len)
  ctx.stroke()
  ctx.setLineDash([])
  const tx = pen.x + dx * (len + 12)
  const ty = pen.y + dy * (len + 12)
  ctx.beginPath()
  ctx.moveTo(tx, ty)
  ctx.lineTo(tx - dx * 18 - dy * 10, ty - dy * 18 + dx * 10)
  ctx.lineTo(tx - dx * 18 + dy * 10, ty - dy * 18 - dx * 10)
  ctx.closePath()
  ctx.fill()
  // Power ring: fills clockwise as you pull harder.
  ctx.lineWidth = 5
  ctx.globalAlpha = 0.9
  ctx.beginPath()
  ctx.arc(pen.x, pen.y, PEN_RADIUS + 16, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * aim.power)
  ctx.stroke()
  ctx.restore()
}

export function drawScene(ctx: CanvasRenderingContext2D, v: View, g: Game, fx: Fx, aim: AimState): void {
  ctx.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  ctx.clearRect(0, 0, v.cw, v.ch)

  const sx = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0
  const sy = fx.shake > 0 ? (Math.random() - 0.5) * fx.shake : 0
  ctx.translate(v.ox + sx, v.oy + sy)
  ctx.scale(v.scale, v.scale)
  // A quarter turn: (x, y) becomes (height - y, x).
  if (v.rotated) ctx.transform(0, 1, -1, 0, v.tableH, 0)

  drawTable(ctx, g.table, g.inset)

  for (const i of [0, 1] as const) {
    const trail = fx.trails[i]
    if (trail.length > 1) {
      ctx.save()
      ctx.lineCap = 'round'
      ctx.strokeStyle = PEN_COLORS[i]
      for (let k = 1; k < trail.length; k++) {
        const a = trail[k - 1]!
        const b = trail[k]!
        ctx.globalAlpha = (k / trail.length) * 0.4
        ctx.lineWidth = 3 + (k / trail.length) * 7
        ctx.beginPath()
        ctx.moveTo(a.x, a.y)
        ctx.lineTo(b.x, b.y)
        ctx.stroke()
      }
      ctx.restore()
    }
  }

  // Falling pens are drawn first so a pen still on the table is never hidden under one that is leaving it.
  const order: PlayerIndex[] = g.pens[0].fall > 0 ? [0, 1] : [1, 0]
  for (const i of order) drawPen(ctx, g.pens[i], i)

  if (g.phase === 'aim') drawAim(ctx, g, aim, fx.time)

  ctx.fillStyle = '#fff7e0'
  for (const s of fx.sparks) {
    ctx.globalAlpha = clamp(s.life * 3, 0, 1)
    ctx.fillRect(s.x - 2, s.y - 2, 4, 4)
  }
  ctx.globalAlpha = 1
}
