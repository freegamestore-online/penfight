import { GameConfirm, GameShell, GameThemeToggle, GameTopbar } from '@freegamestore/games'
import { useRef, useState } from 'react'
import { Menu } from './components/Menu'
import { PlayScreen } from './components/PlayScreen'
import { loadConfig, loadStats, recordMatch, resetStats, saveConfig, saveStats } from './services/storage'
import type { Hud, MatchConfig } from './types'

const RULES = (
  <div className="flex flex-col gap-3 text-sm leading-relaxed">
    <ol className="list-decimal pl-5">
      <li>Press anywhere on the table, pull back and let go. Your pen flicks the opposite way. Pull further for more power.</li>
      <li>Hit the other pen so it slides off the edge. Your pen falling off loses the round.</li>
      <li>Win enough rounds to take the match: best of 1, 3 or 5.</li>
    </ol>
    <p>
      <strong>Keyboard:</strong> ← → turn your aim, ↑ ↓ set power, or hold Space and release to charge a shot.
    </p>
    <p>
      <strong>Sudden death:</strong> after 10 flicks without a knockout the table starts shrinking. Pens swept off the edge fall.
    </p>
    <p>
      <strong>Tables:</strong> the wide desk, a narrow ledge where every hit counts, and a round table with no corners.
    </p>
  </div>
)

const ABOUT = (
  <p className="text-sm leading-relaxed">
    Pen Fight is free and open source (MIT). Your wins and settings stay on this device, and it works offline. Built for{' '}
    <a href="https://freeappstore.online" target="_blank" rel="noopener noreferrer" className="underline">
      freeappstore.online
    </a>
    .
  </p>
)

type Screen = 'menu' | 'play'
type Confirm = 'restart' | 'menu' | 'reset' | null

export default function App() {
  const [screen, setScreen] = useState<Screen>('menu')
  const [config, setConfig] = useState<MatchConfig>(loadConfig)
  const [stats, setStats] = useState(loadStats)
  const [matchId, setMatchId] = useState(0)
  const [paused, setPaused] = useState(false)
  const [hud, setHud] = useState<Hud | null>(null)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const statsRef = useRef(stats)

  const playing = screen === 'play'

  const startMatch = () => {
    saveConfig(config)
    setPaused(false)
    setHud(null)
    setMatchId((n) => n + 1)
    setScreen('play')
  }

  const toMenu = () => {
    setPaused(false)
    setHud(null)
    setScreen('menu')
  }

  const handleMatchEnd = (r: { winner: 0 | 1; rounds: number }) => {
    const next = recordMatch(statsRef.current, { mode: config.mode, winner: r.winner, rounds: r.rounds })
    statsRef.current = next
    setStats(next)
    saveStats(next)
  }

  const ask = (c: Exclude<Confirm, null>) => {
    setPaused(true)
    setConfirm(c)
  }
  const cancelConfirm = () => {
    setConfirm(null)
    if (playing) setPaused(false)
  }

  const finished = hud?.phase === 'matchOver'

  return (
    <GameShell
      topbar={
        <GameTopbar
          title="Pen Fight"
          rules={RULES}
          about={ABOUT}
          onPlayPause={playing && !finished ? () => setPaused((p) => !p) : undefined}
          paused={paused}
          onRestart={playing ? () => ask('restart') : undefined}
          actions={playing ? undefined : <GameThemeToggle />}
        />
      }
    >
      {playing ? (
        <PlayScreen
          key={matchId}
          config={config}
          paused={paused}
          onPausedChange={setPaused}
          onHud={setHud}
          onMatchEnd={handleMatchEnd}
          onRematch={startMatch}
          onExit={toMenu}
          onRestartRequest={() => ask('restart')}
          onMenuRequest={() => ask('menu')}
        />
      ) : (
        <Menu config={config} stats={stats} onChange={setConfig} onPlay={startMatch} onResetStats={() => ask('reset')} />
      )}

      <GameConfirm
        open={confirm === 'restart'}
        title="Restart the match?"
        message="This match will start again from round 1."
        confirmLabel="Restart"
        onCancel={cancelConfirm}
        onConfirm={() => {
          setConfirm(null)
          startMatch()
        }}
      />
      <GameConfirm
        open={confirm === 'menu'}
        title="Leave the match?"
        message="Your current match will be lost."
        confirmLabel="Leave"
        variant="danger"
        onCancel={cancelConfirm}
        onConfirm={() => {
          setConfirm(null)
          toMenu()
        }}
      />
      <GameConfirm
        open={confirm === 'reset'}
        title="Reset your stats?"
        message="Wins, losses and streaks on this device will be cleared."
        confirmLabel="Reset"
        variant="danger"
        onCancel={() => {
          setConfirm(null)
          setPaused(false)
        }}
        onConfirm={() => {
          const fresh = resetStats()
          statsRef.current = fresh
          setStats(fresh)
          setConfirm(null)
          setPaused(false)
        }}
      />
    </GameShell>
  )
}
