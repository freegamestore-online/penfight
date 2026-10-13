# Pen Fight

A free two-player (or vs CPU) pen-flicking physics game: knock the other pen off the table. Best of 1, 3 or 5, three tables, sudden-death shrinking, keyboard/mouse/touch.

- Subdomain: `penfight.freegamestore.online`
- Dev: `pnpm install && pnpm dev`
- Check: `pnpm typecheck && pnpm test && fas check`
- Build: `pnpm build`
- Deploy: `git push upstream main` (GitHub Actions to R2)

Platform conventions (GameShell, brand, mobile, PWA, sound): read https://raw.githubusercontent.com/freeappstore-online/freeappstore/main/SKILLS.md and https://freegamestore.online/skills.md before changing anything platform-related.

## Repo-specific notes

- `web/src/game/rules.ts` is the whole game: fixed-step physics (`STEP` = 1/120 s), turn/round/match state machine, sudden death. It is pure and has no DOM access. `ai.ts` picks CPU shots by simulating candidates with the same physics. `render.ts` only draws.
- `web/src/components/PlayScreen.tsx` owns the canvas, pointer and keyboard input, the CPU turn timing and the round/match overlays. The topbar, pause and confirm dialogs live in `App.tsx` because `GameShell` renders the topbar outside the screen.
- In a portrait container the table is drawn turned a quarter turn (`computeView` / `screenToWorld` in `render.ts`). Always convert pointer positions with `screenToWorld`.
- Sounds use `useGameSounds` from the SDK, which respects the platform mute (muted by default).
- Stored data (localStorage): `penfight:v1:stats` and `penfight:v1:config`, validated in `web/src/services/storage.ts`.
- Run `pnpm test` after touching physics or rules; `game.test.ts` covers collisions, falls, rounds, matches, sudden death and the CPU.
