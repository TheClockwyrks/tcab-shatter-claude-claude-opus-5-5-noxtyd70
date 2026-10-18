import { beforeEach, describe, expect, it } from "vitest";
import {
  BULLET_LIFE,
  FACE_UP,
  ROCK_RADIUS,
  SAFE_X,
  SAFE_Y,
  SAUCER_BULLET_LIFE,
  SAUCER_FIRE_INTERVAL,
  SAUCER_FIRST_DELAY,
  SAUCER_SPEED,
  SAUCER_WEAVE_INTERVAL,
  SHATTER_DEBUG_VERSION,
  TORPEDO_LIFE,
  TORPEDO_SPEED,
} from "./constants";
import type { ShatterDebugApi } from "./game";
import { createHarness, type Harness } from "./test-harness";

let h: Harness;
let d: ShatterDebugApi;

beforeEach(async () => {
  h = await createHarness();
  d = h.debug;
});

describe("the core operations", () => {
  it("reports the version and the title-screen state", () => {
    const s = h.snap();
    expect(d.version).toBe(SHATTER_DEBUG_VERSION);
    expect(s).toMatchObject({
      version: 1,
      screen: "title",
      menuIndex: 0,
      score: 0,
      lives: 3,
      wave: 0,
      waveBanner: 0,
      waveSpawning: true,
      saucerSpawning: true,
      saucerClock: 0,
      saucerDue: SAUCER_FIRST_DELAY,
      torpedoCharge: 1,
      torpedoReady: true,
      saucer: null,
      simTime: 0,
    });
    expect(s.ship).toMatchObject({
      x: SAFE_X,
      y: SAFE_Y,
      angle: FACE_UP,
      speed: 0,
    });
  });

  it("resets every declared field and leaves the state it was handed alone", async () => {
    h.pose((s) => d.setScreen(s, "playing"));
    h.pose((s) => d.addRock(s, "large", 100, 100));
    h.pose((s) => d.setScore(s, 500));
    h.pose((s) => d.setNextSaucerAim(s, 0.1));
    h.pose((s) => d.setWaveSpawning(s, false));
    await h.ticks(3);
    const before = h.engine.state;
    const after = d.reset(before);
    expect(before.rocks).toHaveLength(1);
    expect(after.rocks).toHaveLength(0);
    expect(d.snapshot(after)).toMatchObject({
      screen: "title",
      score: 0,
      simTime: 0,
      nextSaucerAim: null,
      waveSpawning: true,
    });
    expect(after.nextId).toBe(1);
    expect(after.tickClock).toBe(0);
  });

  it("reconciles without changing anything", async () => {
    h.pose((s) => d.setShipVelocity(s, 3, 4));
    const s = h.engine.state;
    const r = d.reconcile(s);
    expect(r).toEqual(s);
    expect(d.snapshot(r).ship.speed).toBe(5);
    expect(d.reconcile(r)).toEqual(r);
  });

  it("reports menu regions only on screens that show a menu", () => {
    const s = h.engine.state;
    const rect = d.menuItemRect(s, 0);
    expect(rect).not.toBeNull();
    expect(d.menuItemRect(s, 2)).toBeNull();
    expect(d.menuItemRect(s, 0.5)).toBeNull();
    expect(d.menuItemRect(d.setScreen(s, "howto"), 0)).toBeNull();
    expect(d.menuItemRect(d.setScreen(s, "playing"), 0)).toBeNull();
    expect(d.menuItemRect(d.setScreen(s, "paused"), 2)).not.toBeNull();
    expect(() => d.menuItemRect(s, Number.NaN)).toThrow();
  });
});

describe("the poses", () => {
  it("sets the run's figures", () => {
    let s = h.engine.state;
    s = d.setScreen(s, "gameover");
    s = d.setMenuIndex(s, 1);
    s = d.setScore(s, 25_000);
    s = d.setLives(s, 7);
    s = d.setWave(s, 4);
    s = d.setWaveBanner(s, 0.75);
    s = d.setSaucerDue(s, 3);
    s = d.setSaucerSpawning(s, false);
    expect(d.snapshot(s)).toMatchObject({
      screen: "gameover",
      menuIndex: 1,
      score: 25_000,
      lives: 7,
      wave: 4,
      waveBanner: 0.75,
      saucerDue: 3,
      saucerSpawning: false,
    });
  });

  it("sets the ship", () => {
    let s = h.engine.state;
    s = d.setShipPosition(s, 10, 20);
    s = d.setShipVelocity(s, 30, 40);
    s = d.setShipAngle(s, 1);
    s = d.setShipInvuln(s, 2);
    s = d.setFireCooldown(s, 5);
    s = d.setShipCollision(s, false);
    expect(d.snapshot(s).ship).toEqual({
      x: 10,
      y: 20,
      vx: 30,
      vy: 40,
      angle: 1,
      speed: 50,
      thrusting: false,
      invuln: 2,
      collision: false,
      fireCooldown: 5,
    });
  });

  it("adds, removes, and clears bullets with fresh ids", () => {
    let s = h.engine.state;
    s = d.addBullet(s, 1, 2, 3, 4);
    s = d.addBullet(s, 5, 6, 7, 8);
    s = d.addEnemyBullet(s, 9, 9, 0, 0);
    const snap = d.snapshot(s);
    expect(snap.bullets[1]).toMatchObject({ x: 5, y: 6, life: BULLET_LIFE });
    expect(snap.enemyBullets[0].life).toBe(SAUCER_BULLET_LIFE);
    const ids = [...snap.bullets, ...snap.enemyBullets].map((b) => b.id);
    expect(new Set(ids).size).toBe(3);
    s = d.removeBullet(s, snap.bullets[0].id);
    expect(d.snapshot(s).bullets).toHaveLength(1);
    s = d.removeEnemyBullet(s, snap.enemyBullets[0].id);
    expect(d.snapshot(s).enemyBullets).toHaveLength(0);
    s = d.clearBullets(d.addEnemyBullet(s, 1, 1, 1, 1));
    expect(d.snapshot(s).bullets).toHaveLength(0);
    expect(d.snapshot(s).enemyBullets).toHaveLength(1);
    expect(d.snapshot(d.clearEnemyBullets(s)).enemyBullets).toHaveLength(0);
  });

  it("adds and arranges rocks", () => {
    let s = d.addRock(h.engine.state, "medium", 50, 60);
    const [rock] = d.snapshot(s).rocks;
    expect(rock).toMatchObject({
      x: 50,
      y: 60,
      vx: 0,
      vy: 0,
      health: 2,
      radius: ROCK_RADIUS.medium,
    });
    s = d.setRockVelocity(s, rock.id, 5, 6);
    s = d.setRockHealth(s, rock.id, 1);
    expect(d.snapshot(s).rocks[0]).toMatchObject({ vx: 5, vy: 6, health: 1 });
    expect(() => d.setRockHealth(s, rock.id, 3)).toThrow();
    expect(() => d.setRockHealth(s, rock.id, 1.5)).toThrow();
    expect(d.snapshot(d.removeRock(s, rock.id)).rocks).toHaveLength(0);
    expect(
      d.snapshot(d.clearRocks(d.addRock(s, "small", 1, 1))).rocks,
    ).toHaveLength(0);
  });

  it("brings in and gates the saucer", () => {
    let s = d.addSaucer(h.engine.state, 100, 200);
    expect(d.snapshot(s).saucer).toMatchObject({
      x: 100,
      y: 200,
      vx: SAUCER_SPEED,
      vy: 0,
      weave: 1,
      fireClock: SAUCER_FIRE_INTERVAL,
      weaveClock: SAUCER_WEAVE_INTERVAL,
      age: 0,
      mind: true,
      gun: true,
      travel: true,
    });
    s = d.setSaucerVelocity(s, -10, 5);
    s = d.setSaucerWeave(s, -1);
    s = d.setSaucerMind(s, false);
    s = d.setSaucerGun(s, false);
    s = d.setSaucerTravel(s, false);
    expect(d.snapshot(s).saucer).toMatchObject({
      vx: -10,
      vy: 5,
      weave: -1,
      mind: false,
      gun: false,
      travel: false,
    });
    expect(() => d.setSaucerWeave(s, 0 as 1)).toThrow();
    s = d.removeSaucer(s);
    expect(d.snapshot(s).saucer).toBeNull();
    expect(d.snapshot(d.removeSaucer(s)).saucer).toBeNull();
    expect(() => d.setSaucerGun(s, true)).toThrow();
  });

  it("poses the draws", () => {
    let s = h.engine.state;
    s = d.setNextSaucerEdge(s, "left");
    s = d.setNextSaucerRow(s, 300);
    s = d.setNextSaucerAim(s, -0.1);
    s = d.setNextRockSpeed(s, 80);
    s = d.setNextRecycleEdge(s, "bottom");
    expect(d.snapshot(s)).toMatchObject({
      nextSaucerEdge: "left",
      nextSaucerRow: 300,
      nextSaucerAim: -0.1,
      nextRockSpeed: 80,
      nextRecycleEdge: "bottom",
    });
    expect(() => d.setNextSaucerEdge(s, "top" as "left")).toThrow();
    expect(() => d.setNextRecycleEdge(s, "middle" as "top")).toThrow();
  });

  it("adds and steers torpedoes", () => {
    let s = d.addTorpedo(h.engine.state, 100, 100, Math.PI / 2);
    const [t] = d.snapshot(s).torpedoes;
    expect(t.vy).toBeCloseTo(TORPEDO_SPEED);
    expect(t).toMatchObject({ life: TORPEDO_LIFE, homing: true });
    s = d.setTorpedoHeading(s, t.id, 0);
    s = d.setTorpedoHoming(s, t.id, false);
    const [u] = d.snapshot(s).torpedoes;
    expect(u.vx).toBeCloseTo(TORPEDO_SPEED);
    expect(u.homing).toBe(false);
    s = d.setTorpedoCharge(s, 0.25);
    expect(d.snapshot(s)).toMatchObject({
      torpedoCharge: 0.25,
      torpedoReady: false,
    });
    expect(() => d.setTorpedoCharge(s, 2)).toThrow();
    expect(d.snapshot(d.removeTorpedo(s, t.id)).torpedoes).toHaveLength(0);
    expect(d.snapshot(d.clearTorpedoes(s)).torpedoes).toHaveLength(0);
  });

  it("fails loudly on bad arguments and unknown ids", () => {
    const s = h.engine.state;
    expect(() => d.setShipPosition(s, Number.NaN, 0)).toThrow();
    expect(() => d.setScore(s, Infinity)).toThrow();
    expect(() => d.setScreen(s, "lobby" as "title")).toThrow();
    expect(() => d.addRock(s, "huge" as "large", 0, 0)).toThrow();
    expect(() => d.removeRock(s, 999)).toThrow();
    expect(() => d.removeBullet(s, 999)).toThrow();
    expect(() => d.setWaveSpawning(s, "yes" as unknown as boolean)).toThrow();
  });
});

it("registers the diagnostics as pure reads", async () => {
  h.pose((s) => d.addSaucer(s, 10, 20));
  const before = h.engine.state;
  const readings = h.engine.diagnostics();
  expect(h.engine.state).toBe(before);
  const names = readings.map((r) => r.name);
  for (const name of [
    "screen",
    "score",
    "lives",
    "wave",
    "ship pos",
    "bullets",
    "rocks",
    "saucer",
    "torpedo charge",
    "torpedoes",
    "sim time",
  ]) {
    expect(names).toContain(name);
  }
  expect(readings.every((r) => r.error === undefined)).toBe(true);
  expect(readings.find((r) => r.name === "saucer")?.value).toBe("10.0, 20.0");
  h.pose((s) => d.removeSaucer(s));
  expect(h.engine.diagnostics().find((r) => r.name === "saucer")?.value).toBe(
    "none",
  );
});
