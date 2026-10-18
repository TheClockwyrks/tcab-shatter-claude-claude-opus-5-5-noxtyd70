# Shatter

Shatter is a gravity-well rock shooter that runs entirely in the browser. You
fly a small ship under pure momentum across a wrapping field of deep space,
shooting armored rocks down through their fragments, while a star fixed at the
centre pulls on every bullet and every rock (but never on your ship). Shots bend
as they cross the well, rocks swing past on curved paths, and a rock the star
swallows comes back in from the edge of the field.

This build is **Warhead**. Rocks carry armor: a Large takes three hits and a
Medium two, and both show their damage as they weaken. The ship also carries a
homing torpedo: one guided shot on a ten-second recharge that homes onto the
nearest body in a narrow forward cone, flies true through the well, and destroys
any rock outright. Clear a wave and a denser, faster one arrives, and a saucer
drops in now and then to hunt you.

## Install

```sh
npm ci
```

## Run in development

```sh
npm run dev
```

Then open the URL Vite prints (by default `http://localhost:5173/`).

## Build for production

```sh
npm run build
```

This type-checks and emits a self-contained static site into `dist/`, with
`index.html` at its root. It runs as-is from any static file server at any base
path. `npm run preview` serves it locally.

## Controls

| Key | In play | On a menu |
| --- | --- | --- |
| `←` `→` or `A` `D` | Turn | |
| `↑` or `W` | Thrust | Move the highlight up |
| `↓` or `S` | | Move the highlight down |
| `Space` | Fire (hold to keep firing) | Confirm |
| `F` | Launch the torpedo | |
| `Enter` | | Confirm |
| `P` or `Esc` | Pause / resume | `Esc` goes back |
| `M` | Mute / unmute | Mute / unmute |
| `` ` `` | Toggle the debug overlay | Toggle the debug overlay |

Menus also take a mouse or touch: hover or touch an entry to highlight it, and
click or tap it to choose it. On a touchscreen the engine shows an on-screen pad
with fire and torpedo buttons.

## Development

| Command | Does |
| --- | --- |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm run format` | Prettier, in check mode |
| `npm test` | The Vitest suite with coverage, run headlessly in Node |

The game lives in `src/`:

- `game.ts` declares the state and binds the game to the Simple 2D engine.
- `update.ts` runs a frame: input, the screens, and the fixed 120 Hz ticks.
- `sim.ts` is the render-free simulation of one tick; `world.ts` and
  `geometry.ts` hold its building blocks.
- `screens.ts` lays out the menus; `render.ts` draws everything.
- `debug.ts` is the debug and automation surface the engine returns from
  `engine.debug`; `diagnostics.ts` feeds the overlay.

The showcase in `showcase/` is captured from real play with
`node scripts/capture-showcase.ts`, which drives the game in headless Chromium
through the keyboard and records replays with the engine's recorder.
