# Pen Fight

A free two-player (or vs CPU) pen-flicking physics game for [FreeGameStore](https://freegamestore.online). Press, pull back and let go to flick your pen across the table and knock your opponent's pen off the edge. Your own pen falling loses the round.

- **Free.** No ads, no paywall, no sign-in.
- **Private.** No cookies and no accounts. Your record never leaves your device.
- **Offline.** Installable PWA that works without a connection after the first visit.
- **Open source.** MIT licensed.

## How to play

- **Touch or mouse:** press anywhere on the table, drag back, release. Pull further for more power.
- **Keyboard:** `←` `→` turn your aim, `↑` `↓` set power, or hold `Space` (or `Enter`) to charge a shot and release to flick.
- Win enough rounds for the match: best of 1, 3 or 5.
- **Sudden death:** after 10 flicks in a round without a knockout, the table shrinks a little every turn. Pens swept off the edge fall.
- Both pens falling in the same turn replays the round.

Modes: **2 Players** on one device (pass and play) or **vs CPU** (Easy, Medium, Hard). Tables: **Desk** (wide), **Ledge** (narrow), **Round**.

The CPU chooses its shot by simulating a spread of candidate shots with the same physics as the game and picking the best. Easy and Medium pick worse shots and aim with more error. Hard almost always finds a knockout when one exists.

Sound effects are synthesized in the browser and follow the platform mute (muted by default). The game pauses when the tab is hidden, and screen shake respects `prefers-reduced-motion`.

## Data stored in the browser

Two localStorage keys, written through `web/src/services/storage.ts`:

| Key | Contents |
| --- | --- |
| `penfight:v1:stats` | CPU wins and losses, current and best win streak, pass-and-play matches, rounds played |
| `penfight:v1:config` | Last chosen mode, CPU level, match length and table |

The menu has a Reset stats button.

## Develop

Requires Node 22+ and pnpm 10.30+.

```bash
pnpm install
pnpm dev          # http://localhost:5173
pnpm typecheck
pnpm test         # physics, rules, sudden death, CPU and storage tests
pnpm build        # production build with the PWA service worker
pnpm preview      # serve dist/ to test offline mode
fas check         # platform compliance
```

## Structure

```
web/src/
  App.tsx                  GameShell, topbar, pause and confirm dialogs, menu/play switching
  game/
    rules.ts               fixed-step physics (120 Hz), turns, rounds, matches, sudden death
    tables.ts              table shapes, edge and fall detection
    ai.ts                  CPU shot selection by simulation
    render.ts              canvas drawing, view transform (turns the table in portrait), effects
    rng.ts                 seeded random for tests
    game.test.ts           unit tests
  components/              Menu, PlayScreen (canvas, input, CPU timing, overlays), Segmented
  services/storage.ts      typed, validated localStorage adapter
  hooks/useGameLoop.ts     requestAnimationFrame loop from the template
```

## Ideas for later

- Optional online leaderboard (needs the connected-app setup; the game stays fully playable without it)
- Pen spin on collisions, more tables, power-ups for the shrinking phase

## License

MIT
