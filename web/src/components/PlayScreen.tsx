import { GameButton, useGameSounds } from '@freegamestore/games'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useGameLoop } from '../hooks/useGameLoop'
import { clamp } from '../lib/canvas'
import { chooseShot, type Shot } from '../game/ai'
import {
  createGame,
  flick,
  nextRound,
  stepGame,
  STEP,
  SUDDEN_DEATH_AFTER,
  type Game,
  type GameEvent,
  type PlayerIndex,
} from '../game/rules'
import { addImpact, computeView, drawScene, newFx, screenToWorld, updateFx, type AimState, type View } from '../game/render'
import type { Hud, MatchConfig } from '../types'

interface Props {
  config: MatchConfig
  paused: boolean
  onPausedChange: (paused: boolean) => void
  onHud: (hud: Hud) => void
  onMatchEnd: (result: { winner: PlayerIndex; rounds: number }) => void
  onRematch: () => void
  onExit: () => void
  /** Ask to restart or leave mid-match; App shows the confirmation. */
  onRestartRequest: () => void
  onMenuRequest: () => void
}

const CPU_THINK_SECONDS = 0.8
const CPU_FLICK_SECONDS = 1.4
const KEY_ANGLE_STEP = 0.06
const MAX_DPR = 2.5

function hudOf(g: Game): Hud {
  return { wins: [g.wins[0], g.wins[1]], round: g.round, turn: g.turn, phase: g.phase, suddenDeath: g.turnCount >= SUDDEN_DEATH_AFTER }
}

const overlayStyle = { background: 'var(--glass)' } as const
const cardStyle = { background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 'var(--radius)' } as const

export function PlayScreen({ config, paused, onPausedChange, onHud, onMatchEnd, onRematch, onExit, onRestartRequest, onMenuRequest }: Props) {
  const sounds = useGameSounds()
  const soundsRef = useRef(sounds)
  soundsRef.current = sounds

  const [game] = useState(() => createGame(config))
  const [fx] = useState(newFx)
  const [ui, setUi] = useState<Hud>(() => hudOf(game))

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const powerBarRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<View | null>(null)
  const aimRef = useRef<AimState>({ active: false, angle: 0, power: 0 })
  const dragRef = useRef<{ id: number; sx: number; sy: number } | null>(null)
  const keyRef = useRef({ charging: false, dir: 1, power: 0.5, angle: 0, touched: false })
  const cpuRef = useRef<{ turnKey: string; t: number; shot: Shot | null }>({ turnKey: '', t: 0, shot: null })
  const accRef = useRef(0)
  const lastHudRef = useRef(JSON.stringify(ui))
  const matchEndedRef = useRef(false)
  const lastBonkRef = useRef(0)
  const handlersRef = useRef({ onHud, onMatchEnd, onPausedChange })
  handlersRef.current = { onHud, onMatchEnd, onPausedChange }

  const [reducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const [coarse] = useState(() => window.matchMedia('(pointer: coarse)').matches)

  const humanTurn = useCallback(() => config.mode === 'local' || game.turn === 0, [config.mode, game])
  const names: [string, string] = config.mode === 'cpu' ? ['You', 'CPU'] : ['Player 1', 'Player 2']

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const view = viewRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !view || !ctx) return
    drawScene(ctx, view, game, fx, aimRef.current)
  }, [game, fx])

  const syncHud = useCallback(() => {
    const hud = hudOf(game)
    const key = JSON.stringify(hud)
    if (key === lastHudRef.current) return
    lastHudRef.current = key
    setUi(hud)
    handlersRef.current.onHud(hud)
  }, [game])

  // Size the canvas to its container and keep the table fitted to it.
  useEffect(() => {
    const wrap = wrapRef.current
    const canvas = canvasRef.current
    if (!wrap || !canvas) return
    const fit = () => {
      const cw = Math.max(1, Math.floor(wrap.clientWidth))
      const ch = Math.max(1, Math.floor(wrap.clientHeight))
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR)
      canvas.width = Math.round(cw * dpr)
      canvas.height = Math.round(ch * dpr)
      canvas.style.width = `${cw}px`
      canvas.style.height = `${ch}px`
      viewRef.current = computeView(game.table, cw, ch, dpr)
      draw()
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(wrap)
    return () => ro.disconnect()
  }, [game, draw])

  useEffect(() => {
    handlersRef.current.onHud(hudOf(game))
  }, [game])

  // Pause automatically when the tab is hidden so a turn is never lost to a background tab.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) handlersRef.current.onPausedChange(true)
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  const doFlick = useCallback(
    (angle: number, power: number) => {
      if (!flick(game, angle, power)) return
      soundsRef.current.playMove()
      aimRef.current = { active: false, angle, power: 0 }
      dragRef.current = null
      keyRef.current.charging = false
      syncHud()
    },
    [game, syncHud],
  )

  const handleEvents = useCallback(
    (events: GameEvent[]) => {
      const s = soundsRef.current
      for (const e of events) {
        if (e.type === 'collision') {
          addImpact(fx, e.x, e.y, e.speed, reducedMotion)
          const now = performance.now()
          if (e.speed > 120 && now - lastBonkRef.current > 90) {
            lastBonkRef.current = now
            s.playDrop()
          }
        } else if (e.type === 'fall') {
          s.playError()
        } else if (e.type === 'roundOver') {
          if (e.winner !== 'draw') (config.mode === 'cpu' && e.winner === 1 ? s.playError : s.playScore)()
        } else if (e.type === 'matchOver') {
          ;(config.mode === 'cpu' && e.winner === 1 ? s.playGameOver : s.playLevelUp)()
          if (!matchEndedRef.current) {
            matchEndedRef.current = true
            handlersRef.current.onMatchEnd({ winner: e.winner, rounds: game.wins[0] + game.wins[1] })
          }
        }
      }
    },
    [fx, reducedMotion, config.mode, game],
  )

  useGameLoop((dt) => {
    accRef.current += dt
    const events: GameEvent[] = []
    while (accRef.current >= STEP) {
      stepGame(game, STEP, events)
      accRef.current -= STEP
    }
    updateFx(fx, game, dt)
    handleEvents(events)

    const aim = aimRef.current
    if (game.phase === 'aim') {
      const turnKey = `${game.round}:${game.turnCount}`
      const cpu = cpuRef.current
      if (cpu.turnKey !== turnKey) {
        // A new aiming phase: reset the aim helpers and point the keyboard aim at the opponent.
        cpu.turnKey = turnKey
        cpu.t = 0
        cpu.shot = null
        const me = game.pens[game.turn]
        const them = game.pens[game.turn === 0 ? 1 : 0]
        keyRef.current = { charging: false, dir: 1, power: 0.5, angle: Math.atan2(them.y - me.y, them.x - me.x), touched: false }
        aimRef.current = { active: false, angle: keyRef.current.angle, power: 0 }
      }
      if (!humanTurn()) {
        cpu.t += dt
        if (!cpu.shot && cpu.t > CPU_THINK_SECONDS) cpu.shot = chooseShot(game, config.difficulty, Math.random)
        if (cpu.shot) {
          aimRef.current = { active: true, angle: cpu.shot.angle, power: cpu.shot.power }
          if (cpu.t > CPU_FLICK_SECONDS) doFlick(cpu.shot.angle, cpu.shot.power)
        }
      } else {
        const k = keyRef.current
        if (k.charging) {
          k.power += k.dir * dt * 0.9
          if (k.power >= 1) {
            k.power = 1
            k.dir = -1
          } else if (k.power <= 0.1) {
            k.power = 0.1
            k.dir = 1
          }
        }
        if (k.touched && !dragRef.current) aimRef.current = { active: true, angle: k.angle, power: k.power }
      }
    } else if (aim.active) {
      aimRef.current = { ...aim, active: false }
    }

    if (powerBarRef.current) {
      const a = aimRef.current
      powerBarRef.current.style.width = a.active && game.phase === 'aim' ? `${Math.round(a.power * 100)}%` : '0%'
    }
    draw()
    syncHud()
  }, paused)

  // Pointer aiming: press anywhere, pull back, release to flick the opposite way.
  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    return { x: e.clientX - r.left, y: e.clientY - r.top }
  }
  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (paused || game.phase !== 'aim' || !humanTurn() || dragRef.current) return
    e.currentTarget.setPointerCapture(e.pointerId)
    const p = local(e)
    dragRef.current = { id: e.pointerId, sx: p.x, sy: p.y }
    keyRef.current.touched = false
  }
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const d = dragRef.current
    const view = viewRef.current
    if (!d || d.id !== e.pointerId || !view) return
    const p = local(e)
    const from = screenToWorld(view, d.sx, d.sy)
    const to = screenToWorld(view, p.x, p.y)
    const distPx = Math.hypot(p.x - d.sx, p.y - d.sy)
    const maxPx = clamp(Math.min(view.cw, view.ch) * 0.35, 70, 170)
    aimRef.current = { active: distPx > 8, angle: Math.atan2(-(to.y - from.y), -(to.x - from.x)), power: clamp(distPx / maxPx, 0, 1) }
  }
  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>, release: boolean) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    const a = aimRef.current
    if (release && a.active && a.power >= 0.1) doFlick(a.angle, a.power)
    else aimRef.current = { ...a, active: false }
  }

  // Keyboard aiming: arrows aim, hold Space (or Enter) to charge, release to flick.
  useEffect(() => {
    if (paused) return
    const usable = () => game.phase === 'aim' && humanTurn()
    const onDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || !usable()) return
      const k = keyRef.current
      switch (e.key) {
        case 'ArrowLeft':
          k.angle -= KEY_ANGLE_STEP
          break
        case 'ArrowRight':
          k.angle += KEY_ANGLE_STEP
          break
        case 'ArrowUp':
          k.power = clamp(k.power + 0.05, 0.1, 1)
          break
        case 'ArrowDown':
          k.power = clamp(k.power - 0.05, 0.1, 1)
          break
        case ' ':
        case 'Enter':
          if (!e.repeat) {
            k.charging = true
            k.dir = 1
          }
          break
        default:
          return
      }
      k.touched = true
      e.preventDefault()
    }
    const onUp = (e: KeyboardEvent) => {
      const k = keyRef.current
      if ((e.key === ' ' || e.key === 'Enter') && k.charging) {
        k.charging = false
        e.preventDefault()
        if (usable()) doFlick(k.angle, k.power)
      }
    }
    window.addEventListener('keydown', onDown)
    window.addEventListener('keyup', onUp)
    return () => {
      window.removeEventListener('keydown', onDown)
      window.removeEventListener('keyup', onUp)
    }
  }, [paused, game, humanTurn, doFlick])

  const turnName = names[ui.turn]
  let status: string
  if (ui.phase === 'moving') status = 'Pens in motion…'
  else if (ui.phase === 'aim' && !humanTurn()) status = 'CPU is lining up a shot…'
  else if (ui.phase === 'aim')
    status = coarse
      ? `${turnName}: press, pull back and let go to flick`
      : `${turnName}: drag back and release, or use ← → and hold Space`
  else status = ''
  if (ui.suddenDeath && ui.phase !== 'matchOver') status += ' Sudden death: the table is shrinking.'

  const roundText = (() => {
    if (game.roundWinner === 'draw') return 'Both pens fell. Replay the round.'
    if (game.roundWinner === null) return ''
    const who = names[game.roundWinner]
    return config.mode === 'cpu' ? (game.roundWinner === 0 ? 'You take the round!' : 'CPU takes the round.') : `${who} takes the round!`
  })()
  const matchText = game.matchWinner === null ? '' : config.mode === 'cpu' ? (game.matchWinner === 0 ? 'You win the match!' : 'CPU wins the match.') : `${names[game.matchWinner]} wins the match!`

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 pb-1 pt-1.5">
        <div className="flex items-center gap-3">
          <p className="min-w-0 flex-1 truncate text-sm font-extrabold tabular-nums">
            {names[0]}: {ui.wins[0]} · {names[1]}: {ui.wins[1]}
            <span className="font-semibold" style={{ color: 'var(--muted)' }}>
              {' '}
              · Round {ui.round}
            </span>
          </p>
          <div className="h-2 w-16 shrink-0 overflow-hidden rounded-full" style={{ background: 'var(--line)' }} aria-hidden="true">
            <div ref={powerBarRef} className="h-full" style={{ width: '0%', background: 'var(--accent)' }} />
          </div>
        </div>
        <p className="mt-0.5 line-clamp-2 h-8 text-xs font-semibold leading-4" aria-live="polite">
          {status}
        </p>
      </div>

      <div ref={wrapRef} className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="absolute inset-0 block"
          style={{ touchAction: 'none' }}
          role="img"
          aria-label={`Pen Fight table. ${status}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => endDrag(e, true)}
          onPointerCancel={(e) => endDrag(e, false)}
          onContextMenu={(e) => e.preventDefault()}
        />

        {paused && ui.phase !== 'matchOver' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={overlayStyle} role="dialog" aria-label="Paused">
            <div className="flex w-full max-w-xs flex-col gap-3 p-5 text-center" style={cardStyle}>
              <h2 className="text-xl font-extrabold" style={{ fontFamily: 'Fraunces, serif' }}>
                Paused
              </h2>
              <GameButton block onClick={() => onPausedChange(false)}>
                Resume
              </GameButton>
              <GameButton block variant="secondary" onClick={onRestartRequest}>
                Restart match
              </GameButton>
              <GameButton block variant="secondary" onClick={onMenuRequest}>
                Menu
              </GameButton>
            </div>
          </div>
        )}

        {!paused && ui.phase === 'roundOver' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={overlayStyle} role="dialog" aria-label="Round over">
            <div className="flex w-full max-w-xs flex-col gap-3 p-5 text-center" style={cardStyle}>
              <h2 className="text-xl font-extrabold" style={{ fontFamily: 'Fraunces, serif' }} aria-live="assertive">
                {roundText}
              </h2>
              <p className="tabular-nums" style={{ color: 'var(--muted)' }}>
                {names[0]}: {ui.wins[0]} · {names[1]}: {ui.wins[1]}
              </p>
              <GameButton
                block
                onClick={() => {
                  nextRound(game)
                  accRef.current = 0
                  syncHud()
                }}
              >
                {game.roundWinner === 'draw' ? 'Replay round' : 'Next round'}
              </GameButton>
            </div>
          </div>
        )}

        {ui.phase === 'matchOver' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center p-4" style={overlayStyle} role="dialog" aria-label="Match over">
            <div className="flex w-full max-w-xs flex-col gap-3 p-5 text-center" style={cardStyle}>
              <h2 className="text-2xl font-extrabold" style={{ fontFamily: 'Fraunces, serif' }} aria-live="assertive">
                {matchText}
              </h2>
              <p className="tabular-nums" style={{ color: 'var(--muted)' }}>
                {names[0]}: {ui.wins[0]} · {names[1]}: {ui.wins[1]}
              </p>
              <GameButton block onClick={onRematch}>
                Rematch
              </GameButton>
              <GameButton block variant="secondary" onClick={onExit}>
                Menu
              </GameButton>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
