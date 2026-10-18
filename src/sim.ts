// The render-free core: one fixed tick of live play, in the order
// `specs/simulation.md` fixes. Everything here reads and writes the working
// copy alone; nothing reads the renderer, the canvas, or the wall clock.

import type { DeepWritable } from "ts-essentials";
import {
  BULLET_LIFE,
  BULLET_R,
  CORE_R,
  CUES,
  EXTRA_LIFE_STEP,
  FIRE_INTERVAL_TICKS,
  HIT_FLASH_TIME,
  INVULN_TIME,
  MAX_BULLETS,
  MUZZLE_SPEED,
  ROCK_CHILD,
  ROCK_RADIUS,
  SAUCER_AIM_ERROR,
  SAUCER_BULLET_LIFE,
  SAUCER_BULLET_R,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_WEAVE_INTERVAL,
  SAUCER_WEAVE_SPEED,
  SCORE_LARGE,
  SCORE_MEDIUM,
  SCORE_SAUCER,
  SCORE_SMALL,
  SHIP_DRAG_HALFLIFE,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SHIP_TURN,
  SPLIT_KICK,
  STAR_X,
  STAR_Y,
  TICK_DT,
  TORPEDO_CONE,
  TORPEDO_LIFE,
  TORPEDO_R,
  TORPEDO_RECHARGE,
  TORPEDO_SCATTER,
  TORPEDO_SPEED,
  TORPEDO_TURN,
  WAVE_BANNER_TIME,
  FIELD_H,
  FIELD_W,
  type CueName,
  type RockSize,
} from "./constants";
import type { RockState } from "./game";
import {
  gravityAt,
  normalizeAngle,
  separation,
  sweptContact,
  wrapAxis,
  type Motion,
} from "./geometry";
import {
  makeRock,
  random,
  recycleRock,
  safeShip,
  saucerArrives,
  saucerLeaves,
  spawnWave,
  takeId,
  uniform,
  type Draft,
} from "./world";

/** What the player is holding on this tick. */
export interface Controls {
  /** `-1` turning counter-clockwise, `1` clockwise, `0` neither. */
  readonly turn: number;
  readonly thrust: boolean;
  readonly fire: boolean;
}

/** Below this a timer counts as run out, absorbing float drift in the sums. */
const EPS = 1e-9;

/** How far outside the core the saucer's mind keeps it. */
const SAUCER_CLEARANCE = CORE_R + SAUCER_R + 24;
/** How far ahead of the core the saucer starts to steer around it. */
const SAUCER_LOOKAHEAD = 200;

const ROCK_SCORE: Readonly<Record<RockSize, number>> = {
  large: SCORE_LARGE,
  medium: SCORE_MEDIUM,
  small: SCORE_SMALL,
};

const DRAG = Math.pow(0.5, TICK_DT / SHIP_DRAG_HALFLIFE);

const STILL = (x: number, y: number): Motion => ({ x, y, mx: 0, my: 0 });
const CORE: Motion = STILL(STAR_X, STAR_Y);

/** Runs one tick of live play on `s`, collecting the cues it raises. */
export function stepPlaying(
  s: Draft,
  controls: Controls,
  cues: Set<CueName>,
): void {
  // 1. Control forces, the guns, the saucer's mind, and the torpedo guidance.
  steerShip(s, controls, cues);
  steerSaucer(s);
  guideTorpedoes(s);

  // 2-4. Gravity, velocity, and position, keeping each body's motion.
  const rockMotion = new Map<number, Motion>();
  const bulletMotion = new Map<number, Motion>();
  const enemyMotion = new Map<number, Motion>();
  const torpedoMotion = new Map<number, Motion>();

  for (const b of s.bullets) bulletMotion.set(b.id, fall(b));
  for (const b of s.enemyBullets) enemyMotion.set(b.id, fall(b));
  for (const r of s.rocks) rockMotion.set(r.id, fall(r));
  for (const t of s.torpedoes) torpedoMotion.set(t.id, glide(t));
  const shipMotion = flyShip(s, controls);
  const saucerMotion = s.saucer === null ? null : flySaucer(s);

  // 6. Collision resolution.
  const destroyed = resolveCollisions(s, cues, {
    rocks: rockMotion,
    bullets: bulletMotion,
    enemy: enemyMotion,
    torpedoes: torpedoMotion,
    ship: shipMotion,
    saucer: saucerMotion,
  });

  runTimers(s, cues);
  runWaveLoop(s, destroyed);
}

// ---- 1. Control forces ---------------------------------------------------

function steerShip(s: Draft, controls: Controls, cues: Set<CueName>): void {
  const ship = s.ship;
  ship.angle += controls.turn * SHIP_TURN * TICK_DT;
  ship.thrusting = controls.thrust;
  ship.invuln = Math.max(0, ship.invuln - TICK_DT);
  if (ship.invuln < EPS) ship.invuln = 0;

  if (ship.fireCooldown > 0)
    ship.fireCooldown = Math.max(0, ship.fireCooldown - 1);
  const wantsFire = controls.fire || s.firePending;
  s.firePending = false;
  if (wantsFire && ship.fireCooldown <= 0 && s.bullets.length < MAX_BULLETS) {
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    s.bullets.push({
      id: takeId(s),
      x: ship.x + cos * SHIP_R,
      y: ship.y + sin * SHIP_R,
      vx: ship.vx + cos * MUZZLE_SPEED,
      vy: ship.vy + sin * MUZZLE_SPEED,
      life: BULLET_LIFE,
    });
    ship.fireCooldown = FIRE_INTERVAL_TICKS;
    cues.add(CUES.fire);
  }

  s.torpedoCharge = Math.min(1, s.torpedoCharge + TICK_DT / TORPEDO_RECHARGE);
  if (s.torpedoCharge > 1 - EPS) s.torpedoCharge = 1;
  const wantsTorpedo = s.torpedoPending;
  s.torpedoPending = false;
  if (wantsTorpedo && s.torpedoCharge >= 1 && s.torpedoes.length === 0) {
    const cos = Math.cos(ship.angle);
    const sin = Math.sin(ship.angle);
    s.torpedoes.push({
      id: takeId(s),
      x: ship.x + cos * SHIP_R,
      y: ship.y + sin * SHIP_R,
      vx: cos * TORPEDO_SPEED,
      vy: sin * TORPEDO_SPEED,
      heading: ship.angle,
      life: TORPEDO_LIFE,
      homing: true,
    });
    s.torpedoCharge = 0;
  }
}

function steerSaucer(s: Draft): void {
  const saucer = s.saucer;
  if (saucer === null) return;

  saucer.weaveClock -= TICK_DT;
  if (saucer.weaveClock <= EPS) {
    saucer.weaveClock += SAUCER_WEAVE_INTERVAL;
    if (saucer.mind) {
      saucer.vy =
        saucer.vy === 0
          ? saucer.weave * SAUCER_WEAVE_SPEED
          : -Math.sign(saucer.vy) * SAUCER_WEAVE_SPEED;
    }
  }

  if (saucer.mind) {
    // Steer around the core: while the core lies ahead within reach and the
    // saucer's row would bring it close, climb or dive away from the star.
    const d = separation(STAR_X, STAR_Y, saucer.x, saucer.y);
    const ahead = saucer.vx === 0 ? 0 : -d.x * Math.sign(saucer.vx);
    const near = Math.abs(d.y) < SAUCER_CLEARANCE;
    if (near && ahead > -SAUCER_CLEARANCE && ahead < SAUCER_LOOKAHEAD) {
      const away = d.y === 0 ? saucer.weave : Math.sign(d.y);
      saucer.vy = away * SAUCER_WEAVE_SPEED;
    }
  }

  saucer.fireClock -= TICK_DT;
  if (saucer.fireClock <= EPS) {
    saucer.fireClock += SAUCER_FIRE_INTERVAL;
    if (saucer.gun) {
      const aim = separation(saucer.x, saucer.y, s.ship.x, s.ship.y);
      const error =
        s.nextSaucerAim ?? uniform(s, -SAUCER_AIM_ERROR, SAUCER_AIM_ERROR);
      s.nextSaucerAim = null;
      const bearing = Math.atan2(aim.y, aim.x) + error;
      s.enemyBullets.push({
        id: takeId(s),
        x: saucer.x,
        y: saucer.y,
        vx: Math.cos(bearing) * SAUCER_BULLET_SPEED + saucer.vx,
        vy: Math.sin(bearing) * SAUCER_BULLET_SPEED + saucer.vy,
        life: SAUCER_BULLET_LIFE,
      });
    }
  }
}

function guideTorpedoes(s: Draft): void {
  const bodies: Array<{ x: number; y: number }> = [...s.rocks];
  if (s.saucer !== null) bodies.push(s.saucer);
  for (const t of s.torpedoes) {
    if (!t.homing) continue;
    let target: { bearing: number; dist: number } | null = null;
    for (const body of bodies) {
      const d = separation(t.x, t.y, body.x, body.y);
      const dist = Math.hypot(d.x, d.y);
      const bearing = Math.atan2(d.y, d.x);
      const inCone =
        dist > 0 &&
        Math.abs(normalizeAngle(bearing - t.heading)) <= TORPEDO_CONE;
      if (inCone && (target === null || dist < target.dist)) {
        target = { bearing, dist };
      }
    }
    if (target === null) continue;
    const off = normalizeAngle(target.bearing - t.heading);
    const step = TORPEDO_TURN * TICK_DT;
    t.heading += Math.max(-step, Math.min(step, off));
    t.vx = Math.cos(t.heading) * TORPEDO_SPEED;
    t.vy = Math.sin(t.heading) * TORPEDO_SPEED;
  }
}

// ---- 2-5. Gravity, velocity, position, and the wrap ----------------------

/** A ballistic body: pulled by the well, then moved and wrapped. */
function fall(b: { x: number; y: number; vx: number; vy: number }): Motion {
  const a = gravityAt(b.x, b.y);
  b.vx += a.x * TICK_DT;
  b.vy += a.y * TICK_DT;
  return glide(b);
}

/** Moves a body along its velocity and wraps it, returning its motion. */
function glide(b: { x: number; y: number; vx: number; vy: number }): Motion {
  const mx = b.vx * TICK_DT;
  const my = b.vy * TICK_DT;
  b.x = wrapAxis(b.x + mx, FIELD_W);
  b.y = wrapAxis(b.y + my, FIELD_H);
  return { x: b.x, y: b.y, mx, my };
}

function flyShip(s: Draft, controls: Controls): Motion {
  const ship = s.ship;
  if (controls.thrust) {
    ship.vx += Math.cos(ship.angle) * SHIP_THRUST * TICK_DT;
    ship.vy += Math.sin(ship.angle) * SHIP_THRUST * TICK_DT;
  }
  ship.vx *= DRAG;
  ship.vy *= DRAG;
  const speed = Math.hypot(ship.vx, ship.vy);
  if (speed > SHIP_MAX) {
    ship.vx *= SHIP_MAX / speed;
    ship.vy *= SHIP_MAX / speed;
  }
  return glide(ship);
}

function flySaucer(s: Draft): Motion | null {
  const saucer = s.saucer;
  if (saucer === null) return null;
  if (!saucer.travel) return STILL(saucer.x, saucer.y);
  const motion = glide(saucer);
  // The saucer's circle never overlaps the core: a centre carried inside the
  // keep-out radius is set back on its rim.
  const d = separation(STAR_X, STAR_Y, saucer.x, saucer.y);
  const dist = Math.hypot(d.x, d.y);
  const keep = CORE_R + SAUCER_R + 1e-6;
  if (dist < keep) {
    const nx = dist === 0 ? 0 : d.x / dist;
    const ny = dist === 0 ? 1 : d.y / dist;
    saucer.x = wrapAxis(STAR_X + nx * keep, FIELD_W);
    saucer.y = wrapAxis(STAR_Y + ny * keep, FIELD_H);
  }
  return { ...motion, x: saucer.x, y: saucer.y };
}

// ---- 6. Collision --------------------------------------------------------

interface Motions {
  readonly rocks: ReadonlyMap<number, Motion>;
  readonly bullets: ReadonlyMap<number, Motion>;
  readonly enemy: ReadonlyMap<number, Motion>;
  readonly torpedoes: ReadonlyMap<number, Motion>;
  readonly ship: Motion;
  readonly saucer: Motion | null;
}

/** What a projectile reached first this tick. */
type Impact =
  | { readonly kind: "core"; readonly t: number }
  | { readonly kind: "rock"; readonly t: number; readonly id: number }
  | { readonly kind: "saucer"; readonly t: number };

function firstImpact(
  s: Draft,
  motion: Motion,
  radius: number,
  m: Motions,
): Impact | null {
  let best: Impact | null = null;
  const tCore = sweptContact(motion, CORE, radius + CORE_R);
  if (tCore !== null) best = { kind: "core", t: tCore };
  for (const r of s.rocks) {
    const rm = m.rocks.get(r.id) ?? STILL(r.x, r.y);
    const t = sweptContact(motion, rm, radius + ROCK_RADIUS[r.size]);
    if (t !== null && (best === null || t < best.t))
      best = { kind: "rock", t, id: r.id };
  }
  if (s.saucer !== null && m.saucer !== null) {
    const t = sweptContact(motion, m.saucer, radius + SAUCER_R);
    if (t !== null && (best === null || t < best.t))
      best = { kind: "saucer", t };
  }
  return best;
}

/** Resolves every impact of the tick, returning how many rocks were destroyed. */
function resolveCollisions(s: Draft, cues: Set<CueName>, m: Motions): number {
  let destroyed = 0;

  const bullets = [...s.bullets];
  s.bullets = [];
  for (const b of bullets) {
    const motion = m.bullets.get(b.id) ?? STILL(b.x, b.y);
    const hit = firstImpact(s, motion, BULLET_R, m);
    if (hit === null) {
      s.bullets.push(b);
    } else if (hit.kind === "rock") {
      const rock = s.rocks.find((r) => r.id === hit.id);
      if (rock !== undefined) {
        rock.health -= 1;
        if (rock.health <= 0) {
          const speed = Math.hypot(b.vx, b.vy) || 1;
          const px = -b.vy / speed;
          const py = b.vx / speed;
          destroyRock(s, rock, px * SPLIT_KICK, py * SPLIT_KICK, cues);
          destroyed += 1;
        } else {
          rock.flash = HIT_FLASH_TIME;
          burst(s, b.x, b.y, 4, 120, 30);
        }
      }
    } else if (hit.kind === "saucer") {
      destroySaucer(s, cues);
    }
  }

  const torpedoes = [...s.torpedoes];
  s.torpedoes = [];
  for (const t of torpedoes) {
    const motion = m.torpedoes.get(t.id) ?? STILL(t.x, t.y);
    const hit = firstImpact(s, motion, TORPEDO_R, m);
    if (hit === null) {
      s.torpedoes.push(t);
    } else if (hit.kind === "rock") {
      const rock = s.rocks.find((r) => r.id === hit.id);
      if (rock !== undefined) {
        const cos = Math.cos(t.heading);
        const sin = Math.sin(t.heading);
        destroyRock(
          s,
          rock,
          cos * TORPEDO_SCATTER,
          sin * TORPEDO_SCATTER,
          cues,
          true,
        );
        destroyed += 1;
      }
    } else if (hit.kind === "saucer") {
      destroySaucer(s, cues);
    } else {
      burst(s, t.x, t.y, 6, 90, 45);
    }
  }

  // Rocks the core reached are recycled from the field's edge.
  for (const r of s.rocks) {
    const motion = m.rocks.get(r.id) ?? STILL(r.x, r.y);
    if (sweptContact(motion, CORE, ROCK_RADIUS[r.size] + CORE_R) !== null) {
      recycleRock(s, r);
    }
  }

  // Saucer bullets the core reached are absorbed.
  s.enemyBullets = s.enemyBullets.filter((b) => {
    const motion = m.enemy.get(b.id) ?? STILL(b.x, b.y);
    return sweptContact(motion, CORE, SAUCER_BULLET_R + CORE_R) === null;
  });

  slideShip(s);
  shipContacts(s, cues, m);
  return destroyed;
}

/**
 * Destroys `rock`: it scores, and a Large or a Medium leaves two fragments at
 * its position, kicked `+kick` and `-kick` over the rock's own velocity.
 */
function destroyRock(
  s: Draft,
  rock: DeepWritable<RockState>,
  kickX: number,
  kickY: number,
  cues: Set<CueName>,
  heavy = false,
): void {
  const index = s.rocks.indexOf(rock);
  s.rocks.splice(index, 1);
  const child = ROCK_CHILD[rock.size];
  if (child !== null) {
    for (const sign of [1, -1]) {
      s.rocks.push(
        makeRock(
          s,
          child,
          rock.x,
          rock.y,
          rock.vx + sign * kickX,
          rock.vy + sign * kickY,
        ),
      );
    }
  }
  award(s, ROCK_SCORE[rock.size], cues);
  burst(s, rock.x, rock.y, heavy ? 18 : 10, ROCK_RADIUS[rock.size] * 3, 30);
  cues.add(CUES.shatter);
}

function destroySaucer(s: Draft, cues: Set<CueName>): void {
  const saucer = s.saucer;
  if (saucer === null) return;
  burst(s, saucer.x, saucer.y, 16, 160, 300);
  saucerLeaves(s);
  award(s, SCORE_SAUCER, cues);
}

/** Pays `points`, granting a ship for every multiple of the step it crosses. */
function award(s: Draft, points: number, cues: Set<CueName>): void {
  const before = Math.floor(s.score / EXTRA_LIFE_STEP);
  s.score += points;
  const gained = Math.floor(s.score / EXTRA_LIFE_STEP) - before;
  if (gained > 0) {
    s.lives += gained;
    s.extraShipBanner = EXTRA_SHIP_BANNER_TIME;
    cues.add(CUES.extraLife);
  }
}

/** How long the extra-ship announcement stays on the field. */
export const EXTRA_SHIP_BANNER_TIME = 1.6;

/** The core is solid: the ship is set back on its rim and slides along it. */
function slideShip(s: Draft): void {
  const ship = s.ship;
  const d = separation(STAR_X, STAR_Y, ship.x, ship.y);
  const dist = Math.hypot(d.x, d.y);
  const rim = CORE_R + SHIP_R;
  if (dist >= rim) return;
  const nx = dist === 0 ? 0 : d.x / dist;
  const ny = dist === 0 ? 1 : d.y / dist;
  ship.x = wrapAxis(STAR_X + nx * rim, FIELD_W);
  ship.y = wrapAxis(STAR_Y + ny * rim, FIELD_H);
  const inward = ship.vx * nx + ship.vy * ny;
  if (inward < 0) {
    ship.vx -= inward * nx;
    ship.vy -= inward * ny;
  }
}

function shipContacts(s: Draft, cues: Set<CueName>, m: Motions): void {
  const ship = s.ship;
  if (!ship.collision || ship.invuln > 0) return;
  const sm = m.ship;
  let lethal = false;
  for (const r of s.rocks) {
    const rm = m.rocks.get(r.id) ?? STILL(r.x, r.y);
    if (sweptContact(sm, rm, SHIP_R + ROCK_RADIUS[r.size]) !== null) {
      lethal = true;
      break;
    }
  }
  if (!lethal && s.saucer !== null && m.saucer !== null) {
    lethal = sweptContact(sm, m.saucer, SHIP_R + SAUCER_R) !== null;
  }
  if (!lethal) {
    const hit = s.enemyBullets.find(
      (b) =>
        sweptContact(
          sm,
          m.enemy.get(b.id) ?? STILL(b.x, b.y),
          SHIP_R + SAUCER_BULLET_R,
        ) !== null,
    );
    if (hit !== undefined) {
      lethal = true;
      s.enemyBullets = s.enemyBullets.filter((b) => b !== hit);
    }
  }
  if (lethal) loseShip(s, cues);
}

/** The ship is destroyed: a life is lost, and the next ship or the end follows. */
function loseShip(s: Draft, cues: Set<CueName>): void {
  burst(s, s.ship.x, s.ship.y, 24, 200, 190);
  cues.add(CUES.death);
  s.lives -= 1;
  if (s.lives > 0) {
    s.ship = safeShip(INVULN_TIME, s.ship.collision);
    s.torpedoCharge = 1;
  } else {
    s.lives = 0;
    s.ship = { ...s.ship, vx: 0, vy: 0, thrusting: false };
    s.screen = "gameover";
    s.menuIndex = 0;
    s.menuPresses = [];
  }
}

// ---- Timers and the loops -------------------------------------------------

function runTimers(s: Draft, cues: Set<CueName>): void {
  for (const b of s.bullets) b.life -= TICK_DT;
  s.bullets = s.bullets.filter((b) => b.life > EPS);
  for (const b of s.enemyBullets) b.life -= TICK_DT;
  s.enemyBullets = s.enemyBullets.filter((b) => b.life > EPS);
  for (const t of s.torpedoes) t.life -= TICK_DT;
  s.torpedoes = s.torpedoes.filter((t) => t.life > EPS);

  for (const r of s.rocks) {
    r.flash = r.flash > EPS ? Math.max(0, r.flash - TICK_DT) : 0;
    if (r.flash < EPS) r.flash = 0;
    r.spin += spinRate(r.id) * TICK_DT;
  }

  for (const d of s.debris) {
    d.x += d.vx * TICK_DT;
    d.y += d.vy * TICK_DT;
    d.vx *= 0.985;
    d.vy *= 0.985;
    d.life -= TICK_DT;
  }
  s.debris = s.debris.filter((d) => d.life > 0);
  s.extraShipBanner = Math.max(0, s.extraShipBanner - TICK_DT);

  const saucer = s.saucer;
  if (saucer !== null) {
    saucer.age += TICK_DT;
    if (saucer.age >= SAUCER_LIFETIME - EPS) saucerLeaves(s);
  } else if (s.saucerSpawning && s.screen === "playing") {
    s.saucerClock += TICK_DT;
    if (s.saucerClock >= s.saucerDue - EPS) {
      saucerArrives(s);
      cues.add(CUES.saucer);
    }
  }
}

/** The cosmetic spin rate a rock is drawn turning at, from its id. */
export function spinRate(id: number): number {
  const h = Math.sin(id * 12.9898) * 43758.5453;
  return (h - Math.floor(h) - 0.5) * 1.6;
}

function runWaveLoop(s: Draft, destroyed: number): void {
  if (s.waveBanner > 0) {
    s.waveBanner -= TICK_DT;
    if (s.waveBanner <= EPS) {
      s.waveBanner = 0;
      if (s.waveSpawning) spawnWave(s);
    }
  }
  if (s.waveSpawning && destroyed > 0 && s.rocks.length === 0) {
    s.wave += 1;
    s.waveBanner = WAVE_BANNER_TIME;
  }
}

/** Throws a ring of cosmetic debris from a point. */
function burst(
  s: Draft,
  x: number,
  y: number,
  count: number,
  speed: number,
  hue: number,
): void {
  for (let i = 0; i < count; i += 1) {
    const angle = random(s) * Math.PI * 2;
    const v = speed * (0.3 + 0.7 * random(s));
    const life = 0.35 + 0.5 * random(s);
    s.debris.push({
      x,
      y,
      vx: Math.cos(angle) * v,
      vy: Math.sin(angle) * v,
      life,
      maxLife: life,
      hue,
    });
  }
  if (s.debris.length > 400) s.debris.splice(0, s.debris.length - 400);
}
