// The debug and automation surface (`specs/instrumentation.md`): readings and
// poses of the state, each written in the shape of `update`. A pose takes the
// current state and returns the next one, built in a fresh working copy so the
// state it was handed stays as it was; a reading returns what it read.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  ROCK_HEALTH,
  ROCK_RADIUS,
  SAUCER_BULLET_LIFE,
  SAUCER_SPEED,
  SHATTER_DEBUG_VERSION,
  TORPEDO_LIFE,
  TORPEDO_SPEED,
  type RockSize,
} from "./constants";
import type { FieldEdge, SaucerEdge, Screen, ShatterState } from "./game";
import { itemRect, menuItems, type Rect } from "./screens";
import {
  draft,
  initialState,
  makeRock,
  makeSaucer,
  takeId,
  type Draft,
} from "./world";

type S = DeepReadonly<ShatterState>;

export interface BulletSnapshot {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

export interface ShatterSnapshot {
  version: number;
  screen: Screen;
  menuIndex: number;
  score: number;
  lives: number;
  wave: number;
  waveBanner: number;
  muted: boolean;
  waveSpawning: boolean;
  saucerSpawning: boolean;
  saucerClock: number;
  saucerDue: number;
  nextSaucerEdge: SaucerEdge | null;
  nextSaucerRow: number | null;
  nextSaucerAim: number | null;
  nextRockSpeed: number | null;
  nextRecycleEdge: FieldEdge | null;
  ship: {
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    speed: number;
    thrusting: boolean;
    invuln: number;
    collision: boolean;
    fireCooldown: number;
  };
  bullets: BulletSnapshot[];
  rocks: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size: RockSize;
    radius: number;
    health: number;
  }[];
  saucer: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    mind: boolean;
    gun: boolean;
    travel: boolean;
    weave: 1 | -1;
    fireClock: number;
    weaveClock: number;
    age: number;
  } | null;
  enemyBullets: BulletSnapshot[];
  torpedoes: {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    heading: number;
    life: number;
    homing: boolean;
  }[];
  torpedoCharge: number;
  torpedoReady: boolean;
  simTime: number;
}

export interface ShatterDebugApi {
  readonly version: number;

  reset(state: S): ShatterState;
  snapshot(state: S): ShatterSnapshot;
  reconcile(state: S): ShatterState;
  menuItemRect(state: S, index: number): Rect | null;

  setScreen(state: S, screen: Screen): ShatterState;
  setMenuIndex(state: S, n: number): ShatterState;
  setScore(state: S, n: number): ShatterState;
  setLives(state: S, n: number): ShatterState;
  setWave(state: S, n: number): ShatterState;
  setWaveBanner(state: S, seconds: number): ShatterState;

  setWaveSpawning(state: S, enabled: boolean): ShatterState;
  setSaucerSpawning(state: S, enabled: boolean): ShatterState;
  setSaucerDue(state: S, seconds: number): ShatterState;

  setShipPosition(state: S, x: number, y: number): ShatterState;
  setShipVelocity(state: S, vx: number, vy: number): ShatterState;
  setShipAngle(state: S, radians: number): ShatterState;
  setShipInvuln(state: S, seconds: number): ShatterState;
  setFireCooldown(state: S, ticks: number): ShatterState;
  setShipCollision(state: S, enabled: boolean): ShatterState;

  addBullet(
    state: S,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeBullet(state: S, id: number): ShatterState;
  clearBullets(state: S): ShatterState;
  addEnemyBullet(
    state: S,
    x: number,
    y: number,
    vx: number,
    vy: number,
  ): ShatterState;
  removeEnemyBullet(state: S, id: number): ShatterState;
  clearEnemyBullets(state: S): ShatterState;

  addRock(state: S, size: RockSize, x: number, y: number): ShatterState;
  setRockVelocity(state: S, id: number, vx: number, vy: number): ShatterState;
  setRockHealth(state: S, id: number, hp: number): ShatterState;
  removeRock(state: S, id: number): ShatterState;
  clearRocks(state: S): ShatterState;

  addSaucer(state: S, x: number, y: number): ShatterState;
  setSaucerVelocity(state: S, vx: number, vy: number): ShatterState;
  setSaucerWeave(state: S, direction: 1 | -1): ShatterState;
  removeSaucer(state: S): ShatterState;
  setSaucerMind(state: S, enabled: boolean): ShatterState;
  setSaucerGun(state: S, enabled: boolean): ShatterState;
  setSaucerTravel(state: S, enabled: boolean): ShatterState;

  setNextSaucerEdge(state: S, edge: SaucerEdge): ShatterState;
  setNextSaucerRow(state: S, y: number): ShatterState;
  setNextSaucerAim(state: S, radians: number): ShatterState;
  setNextRockSpeed(state: S, speed: number): ShatterState;
  setNextRecycleEdge(state: S, edge: FieldEdge): ShatterState;

  setTorpedoCharge(state: S, fraction: number): ShatterState;
  addTorpedo(state: S, x: number, y: number, heading: number): ShatterState;
  setTorpedoHeading(state: S, id: number, radians: number): ShatterState;
  setTorpedoHoming(state: S, id: number, enabled: boolean): ShatterState;
  removeTorpedo(state: S, id: number): ShatterState;
  clearTorpedoes(state: S): ShatterState;
}

// ---- Argument checks: a call the game has no state for fails loudly -------

const SCREENS: readonly Screen[] = [
  "title",
  "howto",
  "playing",
  "paused",
  "gameover",
];
const SIZES: readonly RockSize[] = ["large", "medium", "small"];
const SAUCER_EDGES: readonly SaucerEdge[] = ["left", "right"];
const FIELD_EDGES: readonly FieldEdge[] = ["top", "bottom", "left", "right"];

function num(op: string, name: string, value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError(
      `Shatter debug: ${op} needs a finite number for ${name}, got ${String(value)}`,
    );
  }
  return value;
}

function flag(op: string, value: unknown): boolean {
  if (typeof value !== "boolean") {
    throw new TypeError(
      `Shatter debug: ${op} needs a boolean, got ${String(value)}`,
    );
  }
  return value;
}

function oneOf<T extends string>(
  op: string,
  allowed: readonly T[],
  value: unknown,
): T {
  if (!allowed.includes(value as T)) {
    throw new RangeError(
      `Shatter debug: ${op} takes one of ${allowed.join(", ")}, got ${String(value)}`,
    );
  }
  return value as T;
}

function inRange(
  op: string,
  name: string,
  value: unknown,
  min: number,
  max: number,
): number {
  const n = num(op, name, value);
  if (n < min || n > max) {
    throw new RangeError(
      `Shatter debug: ${op} takes ${name} from ${min} to ${max}, got ${n}`,
    );
  }
  return n;
}

function find<T extends { id: number }>(
  op: string,
  roster: readonly T[],
  id: unknown,
): T {
  const n = num(op, "id", id);
  const found = roster.find((e) => e.id === n);
  if (found === undefined) {
    throw new RangeError(
      `Shatter debug: ${op} found no live entity with id ${n}`,
    );
  }
  return found;
}

/** Runs `change` on a fresh working copy of `state` and returns the copy. */
function pose(state: S, change: (s: Draft) => void): ShatterState {
  const s = draft(state);
  change(s);
  return s;
}

function bulletSnapshot(b: DeepReadonly<BulletSnapshot>): BulletSnapshot {
  return { id: b.id, x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life };
}

/** Builds the surface. It holds no state of its own. */
export function createDebugApi(): ShatterDebugApi {
  return {
    version: SHATTER_DEBUG_VERSION,

    // Every declared field goes back to its title-screen value; the muting
    // bit is the runtime's and the generator simply runs on.
    reset: (state) => ({ ...initialState(state.rng), muted: state.muted }),

    snapshot: (s) => ({
      version: SHATTER_DEBUG_VERSION,
      screen: s.screen,
      menuIndex: s.menuIndex,
      score: s.score,
      lives: s.lives,
      wave: s.wave,
      waveBanner: s.waveBanner,
      muted: s.muted,
      waveSpawning: s.waveSpawning,
      saucerSpawning: s.saucerSpawning,
      saucerClock: s.saucerClock,
      saucerDue: s.saucerDue,
      nextSaucerEdge: s.nextSaucerEdge,
      nextSaucerRow: s.nextSaucerRow,
      nextSaucerAim: s.nextSaucerAim,
      nextRockSpeed: s.nextRockSpeed,
      nextRecycleEdge: s.nextRecycleEdge,
      ship: {
        x: s.ship.x,
        y: s.ship.y,
        vx: s.ship.vx,
        vy: s.ship.vy,
        angle: s.ship.angle,
        speed: Math.hypot(s.ship.vx, s.ship.vy),
        thrusting: s.ship.thrusting,
        invuln: s.ship.invuln,
        collision: s.ship.collision,
        fireCooldown: s.ship.fireCooldown,
      },
      bullets: s.bullets.map(bulletSnapshot),
      rocks: s.rocks.map((r) => ({
        id: r.id,
        x: r.x,
        y: r.y,
        vx: r.vx,
        vy: r.vy,
        size: r.size,
        radius: ROCK_RADIUS[r.size],
        health: r.health,
      })),
      saucer:
        s.saucer === null
          ? null
          : {
              id: s.saucer.id,
              x: s.saucer.x,
              y: s.saucer.y,
              vx: s.saucer.vx,
              vy: s.saucer.vy,
              mind: s.saucer.mind,
              gun: s.saucer.gun,
              travel: s.saucer.travel,
              weave: s.saucer.weave,
              fireClock: s.saucer.fireClock,
              weaveClock: s.saucer.weaveClock,
              age: s.saucer.age,
            },
      enemyBullets: s.enemyBullets.map(bulletSnapshot),
      torpedoes: s.torpedoes.map((t) => ({
        id: t.id,
        x: t.x,
        y: t.y,
        vx: t.vx,
        vy: t.vy,
        heading: t.heading,
        life: t.life,
        homing: t.homing,
      })),
      torpedoCharge: s.torpedoCharge,
      torpedoReady: s.torpedoCharge >= 1,
      simTime: s.simTime,
    }),

    // Speed, radius, and readiness are all worked out at the read, so there is
    // no stored copy to bring back into agreement.
    reconcile: (state) => pose(state, () => undefined),

    menuItemRect: (s, index) => {
      num("menuItemRect", "index", index);
      return itemRect(s.screen, index);
    },

    setScreen: (state, screen) =>
      pose(state, (s) => {
        s.screen = oneOf("setScreen", SCREENS, screen);
        const count = menuItems(s.screen).length;
        if (s.screen === "playing" || s.menuIndex >= count) s.menuIndex = 0;
        s.menuPresses = [];
      }),
    setMenuIndex: (state, n) =>
      pose(state, (s) => {
        s.menuIndex = num("setMenuIndex", "n", n);
      }),
    setScore: (state, n) =>
      pose(state, (s) => {
        s.score = num("setScore", "n", n);
      }),
    setLives: (state, n) =>
      pose(state, (s) => {
        s.lives = num("setLives", "n", n);
      }),
    setWave: (state, n) =>
      pose(state, (s) => {
        s.wave = num("setWave", "n", n);
      }),
    setWaveBanner: (state, seconds) =>
      pose(state, (s) => {
        s.waveBanner = num("setWaveBanner", "seconds", seconds);
      }),

    setWaveSpawning: (state, enabled) =>
      pose(state, (s) => {
        s.waveSpawning = flag("setWaveSpawning", enabled);
      }),
    setSaucerSpawning: (state, enabled) =>
      pose(state, (s) => {
        s.saucerSpawning = flag("setSaucerSpawning", enabled);
      }),
    setSaucerDue: (state, seconds) =>
      pose(state, (s) => {
        s.saucerDue = num("setSaucerDue", "seconds", seconds);
      }),

    setShipPosition: (state, x, y) =>
      pose(state, (s) => {
        s.ship.x = num("setShipPosition", "x", x);
        s.ship.y = num("setShipPosition", "y", y);
      }),
    setShipVelocity: (state, vx, vy) =>
      pose(state, (s) => {
        s.ship.vx = num("setShipVelocity", "vx", vx);
        s.ship.vy = num("setShipVelocity", "vy", vy);
      }),
    setShipAngle: (state, radians) =>
      pose(state, (s) => {
        s.ship.angle = num("setShipAngle", "radians", radians);
      }),
    setShipInvuln: (state, seconds) =>
      pose(state, (s) => {
        s.ship.invuln = num("setShipInvuln", "seconds", seconds);
      }),
    setFireCooldown: (state, ticks) =>
      pose(state, (s) => {
        s.ship.fireCooldown = num("setFireCooldown", "ticks", ticks);
      }),
    setShipCollision: (state, enabled) =>
      pose(state, (s) => {
        s.ship.collision = flag("setShipCollision", enabled);
      }),

    addBullet: (state, x, y, vx, vy) =>
      pose(state, (s) => {
        const op = "addBullet";
        s.bullets.push({
          id: takeId(s),
          x: num(op, "x", x),
          y: num(op, "y", y),
          vx: num(op, "vx", vx),
          vy: num(op, "vy", vy),
          life: BULLET_LIFE,
        });
      }),
    removeBullet: (state, id) =>
      pose(state, (s) => {
        const b = find("removeBullet", s.bullets, id);
        s.bullets = s.bullets.filter((e) => e !== b);
      }),
    clearBullets: (state) =>
      pose(state, (s) => {
        s.bullets = [];
      }),
    addEnemyBullet: (state, x, y, vx, vy) =>
      pose(state, (s) => {
        const op = "addEnemyBullet";
        s.enemyBullets.push({
          id: takeId(s),
          x: num(op, "x", x),
          y: num(op, "y", y),
          vx: num(op, "vx", vx),
          vy: num(op, "vy", vy),
          life: SAUCER_BULLET_LIFE,
        });
      }),
    removeEnemyBullet: (state, id) =>
      pose(state, (s) => {
        const b = find("removeEnemyBullet", s.enemyBullets, id);
        s.enemyBullets = s.enemyBullets.filter((e) => e !== b);
      }),
    clearEnemyBullets: (state) =>
      pose(state, (s) => {
        s.enemyBullets = [];
      }),

    addRock: (state, size, x, y) =>
      pose(state, (s) => {
        const op = "addRock";
        const kind = oneOf(op, SIZES, size);
        s.rocks.push(makeRock(s, kind, num(op, "x", x), num(op, "y", y), 0, 0));
      }),
    setRockVelocity: (state, id, vx, vy) =>
      pose(state, (s) => {
        const op = "setRockVelocity";
        const rock = find(op, s.rocks, id);
        rock.vx = num(op, "vx", vx);
        rock.vy = num(op, "vy", vy);
      }),
    setRockHealth: (state, id, hp) =>
      pose(state, (s) => {
        const op = "setRockHealth";
        const rock = find(op, s.rocks, id);
        const n = inRange(op, "hp", hp, 1, ROCK_HEALTH[rock.size]);
        if (!Number.isInteger(n)) {
          throw new RangeError(
            `Shatter debug: ${op} takes whole hits, got ${n}`,
          );
        }
        rock.health = n;
      }),
    removeRock: (state, id) =>
      pose(state, (s) => {
        const rock = find("removeRock", s.rocks, id);
        s.rocks = s.rocks.filter((r) => r !== rock);
      }),
    clearRocks: (state) =>
      pose(state, (s) => {
        s.rocks = [];
      }),

    addSaucer: (state, x, y) =>
      pose(state, (s) => {
        const op = "addSaucer";
        s.saucer = makeSaucer(
          s,
          num(op, "x", x),
          num(op, "y", y),
          SAUCER_SPEED,
          1,
        );
      }),
    setSaucerVelocity: (state, vx, vy) =>
      pose(state, (s) => {
        const op = "setSaucerVelocity";
        const saucer = liveSaucer(op, s);
        saucer.vx = num(op, "vx", vx);
        saucer.vy = num(op, "vy", vy);
      }),
    setSaucerWeave: (state, direction) =>
      pose(state, (s) => {
        const op = "setSaucerWeave";
        const saucer = liveSaucer(op, s);
        if (direction !== 1 && direction !== -1) {
          throw new RangeError(
            `Shatter debug: ${op} takes 1 or -1, got ${String(direction)}`,
          );
        }
        saucer.weave = direction;
      }),
    removeSaucer: (state) =>
      pose(state, (s) => {
        s.saucer = null;
      }),
    setSaucerMind: (state, enabled) =>
      pose(state, (s) => {
        liveSaucer("setSaucerMind", s).mind = flag("setSaucerMind", enabled);
      }),
    setSaucerGun: (state, enabled) =>
      pose(state, (s) => {
        liveSaucer("setSaucerGun", s).gun = flag("setSaucerGun", enabled);
      }),
    setSaucerTravel: (state, enabled) =>
      pose(state, (s) => {
        liveSaucer("setSaucerTravel", s).travel = flag(
          "setSaucerTravel",
          enabled,
        );
      }),

    setNextSaucerEdge: (state, edge) =>
      pose(state, (s) => {
        s.nextSaucerEdge = oneOf("setNextSaucerEdge", SAUCER_EDGES, edge);
      }),
    setNextSaucerRow: (state, y) =>
      pose(state, (s) => {
        s.nextSaucerRow = num("setNextSaucerRow", "y", y);
      }),
    setNextSaucerAim: (state, radians) =>
      pose(state, (s) => {
        s.nextSaucerAim = num("setNextSaucerAim", "radians", radians);
      }),
    setNextRockSpeed: (state, speed) =>
      pose(state, (s) => {
        s.nextRockSpeed = num("setNextRockSpeed", "speed", speed);
      }),
    setNextRecycleEdge: (state, edge) =>
      pose(state, (s) => {
        s.nextRecycleEdge = oneOf("setNextRecycleEdge", FIELD_EDGES, edge);
      }),

    setTorpedoCharge: (state, fraction) =>
      pose(state, (s) => {
        s.torpedoCharge = inRange(
          "setTorpedoCharge",
          "fraction",
          fraction,
          0,
          1,
        );
      }),
    addTorpedo: (state, x, y, heading) =>
      pose(state, (s) => {
        const op = "addTorpedo";
        const h = num(op, "heading", heading);
        s.torpedoes.push({
          id: takeId(s),
          x: num(op, "x", x),
          y: num(op, "y", y),
          vx: Math.cos(h) * TORPEDO_SPEED,
          vy: Math.sin(h) * TORPEDO_SPEED,
          heading: h,
          life: TORPEDO_LIFE,
          homing: true,
        });
      }),
    setTorpedoHeading: (state, id, radians) =>
      pose(state, (s) => {
        const op = "setTorpedoHeading";
        const t = find(op, s.torpedoes, id);
        const h = num(op, "radians", radians);
        const speed = Math.hypot(t.vx, t.vy);
        t.heading = h;
        t.vx = Math.cos(h) * speed;
        t.vy = Math.sin(h) * speed;
      }),
    setTorpedoHoming: (state, id, enabled) =>
      pose(state, (s) => {
        const op = "setTorpedoHoming";
        find(op, s.torpedoes, id).homing = flag(op, enabled);
      }),
    removeTorpedo: (state, id) =>
      pose(state, (s) => {
        const t = find("removeTorpedo", s.torpedoes, id);
        s.torpedoes = s.torpedoes.filter((e) => e !== t);
      }),
    clearTorpedoes: (state) =>
      pose(state, (s) => {
        s.torpedoes = [];
      }),
  };
}

function liveSaucer(op: string, s: Draft): NonNullable<Draft["saucer"]> {
  if (s.saucer === null) {
    throw new RangeError(`Shatter debug: ${op} needs a saucer on the field`);
  }
  return s.saucer;
}
