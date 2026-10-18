// The world's building blocks: the working copy a frame mutates, the opening
// and new-game states, the random generator, and the spawners every rule that
// puts a body on the field goes through.

import type { DeepReadonly, DeepWritable } from "ts-essentials";
import {
  FACE_UP,
  FIELD_H,
  FIELD_W,
  ROCK_HEALTH,
  ROCK_SPEED_MAX,
  ROCK_SPEED_MIN,
  SAFE_X,
  SAFE_Y,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_GAP_MAX,
  SAUCER_GAP_MIN,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_INTERVAL,
  START_LIVES,
  STAR_X,
  STAR_Y,
  WAVE_BANNER_TIME,
  WAVE_BASE_ROCKS,
  WAVE_MIN_SHIP_DIST,
  WAVE_MIN_STAR_DIST,
  WAVE_SPEED_CAP,
  WAVE_SPEED_STEP,
  type RockSize,
} from "./constants";
import type {
  FieldEdge,
  RockState,
  SaucerState,
  ShatterState,
  ShipState,
} from "./game";
import { wrappedDistance } from "./geometry";

/** The working copy one frame or one pose builds the next state in. */
export type Draft = DeepWritable<ShatterState>;

/**
 * A fresh, writable copy of `state`. The copy shares nothing with the state it
 * was taken from, so writing into it leaves that state exactly as it was.
 */
export function draft(state: DeepReadonly<ShatterState>): Draft {
  return {
    ...state,
    ship: { ...state.ship },
    bullets: state.bullets.map((b) => ({ ...b })),
    rocks: state.rocks.map((r) => ({ ...r })),
    saucer: state.saucer === null ? null : { ...state.saucer },
    enemyBullets: state.enemyBullets.map((b) => ({ ...b })),
    torpedoes: state.torpedoes.map((t) => ({ ...t })),
    menuPresses: state.menuPresses.map((p) => ({ ...p })),
    debris: state.debris.map((d) => ({ ...d })),
  };
}

/** A ship at rest at the safe point, facing up, with its contact gate on. */
export function safeShip(invuln: number, collision = true): ShipState {
  return {
    x: SAFE_X,
    y: SAFE_Y,
    vx: 0,
    vy: 0,
    angle: FACE_UP,
    thrusting: false,
    invuln,
    collision,
    fireCooldown: 0,
  };
}

/** The title-screen state every declared field is restored to by `reset`. */
export function initialState(seed: number): ShatterState {
  return {
    screen: "title",
    menuIndex: 0,
    score: 0,
    lives: START_LIVES,
    wave: 0,
    waveBanner: 0,
    ship: safeShip(0),
    bullets: [],
    rocks: [],
    saucer: null,
    enemyBullets: [],
    torpedoes: [],
    torpedoCharge: 1,
    waveSpawning: true,
    saucerSpawning: true,
    saucerClock: 0,
    saucerDue: SAUCER_FIRST_DELAY,
    nextSaucerEdge: null,
    nextSaucerRow: null,
    nextSaucerAim: null,
    nextRockSpeed: null,
    nextRecycleEdge: null,
    tickClock: 0,
    nextId: 1,
    simTime: 0,
    muted: false,
    rng: seed >>> 0,
    firePending: false,
    torpedoPending: false,
    menuPresses: [],
    extraShipBanner: 0,
    debris: [],
  };
}

/**
 * Opens a new game on `s`: three ships, no score, wave 1 announced by its
 * banner, a field cleared of everything, and the saucer cadence from the top.
 * The gates and any posed draws stand as they were.
 */
export function startNewGame(s: Draft): void {
  s.screen = "playing";
  s.menuIndex = 0;
  s.score = 0;
  s.lives = START_LIVES;
  s.wave = 1;
  s.waveBanner = WAVE_BANNER_TIME;
  s.ship = { ...safeShip(0, s.ship.collision) };
  s.bullets = [];
  s.rocks = [];
  s.saucer = null;
  s.enemyBullets = [];
  s.torpedoes = [];
  s.torpedoCharge = 1;
  s.saucerClock = 0;
  s.saucerDue = SAUCER_FIRST_DELAY;
  s.firePending = false;
  s.torpedoPending = false;
  s.menuPresses = [];
  s.extraShipBanner = 0;
  s.debris = [];
}

// ---- Random draws --------------------------------------------------------

/** A uniform draw from `[0, 1)`, advancing the generator (mulberry32). */
export function random(s: { rng: number }): number {
  s.rng = (s.rng + 0x6d2b79f5) >>> 0;
  let t = s.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
}

/** A uniform draw from `[min, max)`. */
export function uniform(s: { rng: number }, min: number, max: number): number {
  return min + (max - min) * random(s);
}

/** The id the next entity takes. */
export function takeId(s: Draft): number {
  const id = s.nextId;
  s.nextId += 1;
  return id;
}

// ---- Rocks ---------------------------------------------------------------

/** A rock at full health for its size. */
export function makeRock(
  s: Draft,
  size: RockSize,
  x: number,
  y: number,
  vx: number,
  vy: number,
): RockState {
  return {
    id: takeId(s),
    x,
    y,
    vx,
    vy,
    size,
    spin: random(s) * Math.PI * 2,
    health: ROCK_HEALTH[size],
    flash: 0,
  };
}

/** The speed multiplier wave `n`'s rocks take over their base drift speed. */
export function waveSpeedFactor(n: number): number {
  return 1 + Math.min(WAVE_SPEED_CAP, WAVE_SPEED_STEP * (n - 1));
}

/** A position at least the wave minimums from the ship and the star. */
function waveSpawnPoint(s: Draft): { x: number; y: number } {
  for (let attempt = 0; attempt < 10_000; attempt += 1) {
    const x = random(s) * FIELD_W;
    const y = random(s) * FIELD_H;
    if (
      wrappedDistance(x, y, s.ship.x, s.ship.y) >= WAVE_MIN_SHIP_DIST &&
      wrappedDistance(x, y, STAR_X, STAR_Y) >= WAVE_MIN_STAR_DIST
    ) {
      return { x, y };
    }
  }
  // Unreachable on this field: the two exclusion discs never cover it.
  return { x: 0, y: 0 };
}

/** Puts up wave `s.wave`'s Large rocks, consuming any posed base speed. */
export function spawnWave(s: Draft): void {
  const count = WAVE_BASE_ROCKS + s.wave;
  const posed = s.nextRockSpeed;
  s.nextRockSpeed = null;
  const factor = waveSpeedFactor(s.wave);
  for (let i = 0; i < count; i += 1) {
    const { x, y } = waveSpawnPoint(s);
    const heading = random(s) * Math.PI * 2;
    const base =
      posed ?? uniform(s, ROCK_SPEED_MIN.large, ROCK_SPEED_MAX.large);
    const speed = base * factor;
    s.rocks.push(
      makeRock(
        s,
        "large",
        x,
        y,
        Math.cos(heading) * speed,
        Math.sin(heading) * speed,
      ),
    );
  }
}

const EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

/**
 * Re-places a rock the star swallowed at a point on one of the field's edges,
 * heading straight inward at a fresh base drift speed. Its size, id, and
 * health are kept.
 */
export function recycleRock(s: Draft, rock: DeepWritable<RockState>): void {
  const edge = s.nextRecycleEdge ?? EDGES[Math.floor(random(s) * 4)];
  s.nextRecycleEdge = null;
  const along = random(s);
  const speed =
    s.nextRockSpeed ??
    uniform(s, ROCK_SPEED_MIN[rock.size], ROCK_SPEED_MAX[rock.size]);
  s.nextRockSpeed = null;
  rock.flash = 0;
  switch (edge) {
    case "top":
      Object.assign(rock, { x: along * FIELD_W, y: 0, vx: 0, vy: speed });
      break;
    case "bottom":
      Object.assign(rock, {
        x: along * FIELD_W,
        y: FIELD_H - 1e-6,
        vx: 0,
        vy: -speed,
      });
      break;
    case "left":
      Object.assign(rock, { x: 0, y: along * FIELD_H, vx: speed, vy: 0 });
      break;
    case "right":
      Object.assign(rock, {
        x: FIELD_W - 1e-6,
        y: along * FIELD_H,
        vx: -speed,
        vy: 0,
      });
      break;
  }
}

// ---- The saucer ----------------------------------------------------------

/** A saucer with every faculty on and its clocks at the start of a visit. */
export function makeSaucer(
  s: Draft,
  x: number,
  y: number,
  vx: number,
  weave: 1 | -1,
): SaucerState {
  return {
    id: takeId(s),
    x,
    y,
    vx,
    vy: 0,
    mind: true,
    gun: true,
    travel: true,
    weave,
    fireClock: SAUCER_FIRE_INTERVAL,
    weaveClock: SAUCER_WEAVE_INTERVAL,
    age: 0,
  };
}

/** Brings the cadence's saucer in, consuming any posed edge and row. */
export function saucerArrives(s: Draft): void {
  const edge = s.nextSaucerEdge ?? (random(s) < 0.5 ? "left" : "right");
  s.nextSaucerEdge = null;
  const row = s.nextSaucerRow ?? uniform(s, SAUCER_R, FIELD_H - SAUCER_R);
  s.nextSaucerRow = null;
  const weave: 1 | -1 = random(s) < 0.5 ? 1 : -1;
  const x = edge === "left" ? 0 : FIELD_W - 1e-6;
  const vx = edge === "left" ? SAUCER_SPEED : -SAUCER_SPEED;
  s.saucer = makeSaucer(s, x, row, vx, weave);
  s.saucerClock = 0;
}

/** The saucer leaves, by its own clock or shot down, and a fresh gap is drawn. */
export function saucerLeaves(s: Draft): void {
  s.saucer = null;
  s.saucerClock = 0;
  s.saucerDue = uniform(s, SAUCER_GAP_MIN, SAUCER_GAP_MAX);
}
