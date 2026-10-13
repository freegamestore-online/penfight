import { GameButton } from '@freegamestore/games'
import type { BestOf, Difficulty, MatchConfig, PlayerMode, Stats, TableId } from '../types'
import { Segmented } from './Segmented'

interface Props {
  config: MatchConfig
  stats: Stats
  onChange: (config: MatchConfig) => void
  onPlay: () => void
  onResetStats: () => void
}

function StatsLine({ stats, onResetStats }: { stats: Stats; onResetStats: () => void }) {
  const played = stats.cpuWins + stats.cpuLosses + stats.localMatches
  return (
    <div className="text-center text-xs" style={{ color: 'var(--muted)' }}>
      {played === 0 ? (
        'No matches yet. Your record is kept on this device.'
      ) : (
        <>
          <span>
            vs CPU: {stats.cpuWins} won · {stats.cpuLosses} lost · best streak {stats.bestStreak}
          </span>
          {stats.localMatches > 0 && <span> · {stats.localMatches} pass-and-play</span>}{' '}
          <button type="button" className="min-h-11 px-2 underline" onClick={onResetStats}>
            Reset stats
          </button>
        </>
      )}
    </div>
  )
}

export function Menu({ config, stats, onChange, onPlay, onResetStats }: Props) {
  const set = <K extends keyof MatchConfig>(key: K, value: MatchConfig[K]) => onChange({ ...config, [key]: value })

  const playBlock = (
    <>
      <GameButton size="lg" block onClick={onPlay}>
        Play
      </GameButton>
      <StatsLine stats={stats} onResetStats={onResetStats} />
    </>
  )

  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-3 p-4 compact:gap-2 compact:p-3 short:flex-row short:items-center short:gap-6">
        <div className="flex flex-col gap-3 short:w-2/5">
          <div>
            <h1 className="text-3xl font-extrabold leading-tight compact:text-2xl" style={{ fontFamily: 'Fraunces, serif' }}>
              Pen Fight
            </h1>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>
              Flick your pen. Knock theirs off the table.
            </p>
          </div>
          <div className="hidden flex-col gap-2 short:flex">{playBlock}</div>
        </div>

        <div className="grid gap-3 compact:gap-2 short:w-3/5 short:grid-cols-2">
          <Segmented<PlayerMode>
            label="Players"
            value={config.mode}
            onChange={(v) => set('mode', v)}
            options={[
              { value: 'local', label: '2 Players', aria: 'Two players on this device' },
              { value: 'cpu', label: 'vs CPU' },
            ]}
          />
          {config.mode === 'cpu' ? (
            <Segmented<Difficulty>
              label="CPU level"
              value={config.difficulty}
              onChange={(v) => set('difficulty', v)}
              options={[
                { value: 'easy', label: 'Easy' },
                { value: 'medium', label: 'Medium' },
                { value: 'hard', label: 'Hard' },
              ]}
            />
          ) : (
            <div className="hidden short:block" aria-hidden="true" />
          )}
          <Segmented<BestOf>
            label="Match"
            value={config.bestOf}
            onChange={(v) => set('bestOf', v)}
            options={[
              { value: 1, label: 'Best of 1', aria: 'Best of 1 round' },
              { value: 3, label: 'Best of 3', aria: 'Best of 3 rounds' },
              { value: 5, label: 'Best of 5', aria: 'Best of 5 rounds' },
            ]}
          />
          <Segmented<TableId>
            label="Table"
            value={config.table}
            onChange={(v) => set('table', v)}
            options={[
              { value: 'classic', label: 'Desk', aria: 'Classic desk' },
              { value: 'ledge', label: 'Ledge', aria: 'Narrow ledge' },
              { value: 'round', label: 'Round', aria: 'Round table' },
            ]}
          />
          <div className="flex flex-col gap-2 short:hidden">{playBlock}</div>
        </div>
      </div>
    </div>
  )
}
