import { beforeEach, describe, expect, it } from "vitest";
import {
  BULLET_LIFE,
  CORE_R,
  FIRE_INTERVAL_TICKS,
  INVULN_TIME,
  MAX_BULLETS,
  MUZZLE_SPEED,
  ROCK_SPEED_MAX,
  ROCK_SPEED_MIN,
  SAFE_X,
  SAFE_Y,
  SAUCER_BULLET_SPEED,
  SAUCER_FIRE_INTERVAL,
  SAUCER_LIFETIME,
  SAUCER_R,
  SAUCER_SPEED,
  SAUCER_WEAVE_SPEED,
  SCORE_LARGE,
  SCORE_SAUCER,
  SCORE_SMALL,
  SHIP_MAX,
  SHIP_R,
  SHIP_THRUST,
  SPLIT_KICK,
  STAR_X,
  STAR_Y,
  TICK_DT,
  TORPEDO_SCATTER,
  TORPEDO_SPEED,
  WAVE_BANNER_TIME,
} from "./constants";
import { createHarness, type Harness } from "./test-harness";

let h: Harness;

/** A live field with every spawner shut, so a test arranges exactly its own. */
async function arena(): Promise<Harness> {
  const harness = await createHarness();
  const d = harness.debug;
  harness.pose((s) => d.setScreen(s, "playing"));
  harness.pose((s) => d.setWaveSpawning(s, false));
  harness.pose((s) => d.setSaucerSpawning(s, false));
  return harness;
}

beforeEach(async () => {
  h = await arena();
});

describe("the ship", () => {
  it("turns at a constant rate without touching its velocity", async () => {
    h.keyDown("ArrowRight");
    await h.ticks(60);
    h.keyUp("ArrowRight");
    const s = h.snap();
    expect(s.ship.angle).toBeCloseTo(
      -Math.PI / 2 + (300 * Math.PI) / 180 / 2,
      6,
    );
    expect(s.ship.speed).toBe(0);
  });

  it("thrusts along its facing, flags the flame, and loops the thrust cue", async () => {
    h.keyDown("ArrowUp");
    await h.ticks(1);
    let s = h.snap();
    expect(s.ship.thrusting).toBe(true);
    expect(s.ship.vy).toBeLessThan(0);
    expect(s.ship.vy).toBeCloseTo(
      -SHIP_THRUST * TICK_DT * Math.pow(0.5, TICK_DT / 3),
      6,
    );
    expect(h.loops).toContain("thrust");
    expect(h.engine.state.ship.thrusting).toBe(true);
    h.keyUp("ArrowUp");
    await h.ticks(1);
    s = h.snap();
    expect(s.ship.thrusting).toBe(false);
  });

  it("halves its speed every drag half-life and never passes the cap", async () => {
    h.pose((s) => h.debug.setShipVelocity(s, 300, 0));
    await h.ticks(360);
    expect(h.snap().ship.speed).toBeCloseTo(150, 6);
    h.pose((s) => h.debug.setShipVelocity(s, 5000, 0));
    await h.ticks(1);
    expect(h.snap().ship.speed).toBeCloseTo(SHIP_MAX, 6);
  });

  it("is never pulled by the star and wraps across the edges", async () => {
    h.pose((s) => h.debug.setShipPosition(s, 1275, 200));
    h.pose((s) => h.debug.setShipVelocity(s, 600, 0));
    await h.ticks(2);
    const s = h.snap();
    expect(s.ship.vy).toBe(0);
    expect(s.ship.x).toBeLessThan(10);
  });

  it("slides along the core without losing a life", async () => {
    h.pose((s) => h.debug.setShipPosition(s, STAR_X, STAR_Y + 46));
    h.pose((s) => h.debug.setShipVelocity(s, 0, -300));
    await h.ticks(1);
    const s = h.snap();
    const d = Math.hypot(s.ship.x - STAR_X, s.ship.y - STAR_Y);
    expect(d).toBeCloseTo(CORE_R + SHIP_R, 6);
    expect(s.ship.vy).toBeCloseTo(0, 6);
    expect(s.ship.vx).toBe(0);
    expect(s.lives).toBe(3);
  });
});

describe("the gun", () => {
  it("fires from the nose at the muzzle speed over the ship's velocity", async () => {
    h.pose((s) => h.debug.setShipVelocity(s, 50, 0));
    await h.tap("Space");
    const [b] = h.snap().bullets;
    expect(b).toBeDefined();
    const ship = h.snap().ship;
    expect(Math.hypot(b.x - ship.x, b.y - ship.y)).toBeLessThanOrEqual(
      SHIP_R + 10,
    );
    expect(b.vx).toBeCloseTo(50 * Math.pow(0.5, TICK_DT / 3), 0);
    expect(b.vy).toBeLessThan(-MUZZLE_SPEED + 10);
    expect(h.cues).toEqual(["fire"]);
  });

  it("repeats at the fire gate while held and caps the bullets in flight", async () => {
    h.keyDown("Space");
    await h.ticks(1);
    expect(h.snap().bullets).toHaveLength(1);
    await h.ticks(FIRE_INTERVAL_TICKS - 1);
    expect(h.snap().bullets).toHaveLength(1);
    await h.ticks(1);
    expect(h.snap().bullets).toHaveLength(2);
    await h.ticks(FIRE_INTERVAL_TICKS * 6);
    expect(h.snap().bullets.length).toBeLessThanOrEqual(MAX_BULLETS);
  });

  it("removes a bullet when its lifetime runs out", async () => {
    h.pose((s) => h.debug.addBullet(s, 100, 100, 0, 0));
    expect(h.snap().bullets[0].life).toBe(BULLET_LIFE);
    await h.ticks(179);
    expect(h.snap().bullets).toHaveLength(1);
    await h.ticks(1);
    expect(h.snap().bullets).toHaveLength(0);
  });

  it("bends shots toward the star and absorbs them in the core", async () => {
    h.pose((s) => h.debug.addBullet(s, STAR_X - 150, STAR_Y, 0, -100));
    await h.ticks(1);
    expect(h.snap().bullets[0].vx).toBeCloseTo(200 * TICK_DT, 6);
    h.pose((s) => h.debug.addBullet(s, STAR_X - 200, STAR_Y, 5000, 0));
    await h.ticks(5);
    expect(h.snap().bullets).toHaveLength(1);
    expect(h.snap().score).toBe(0);
  });
});

describe("armor and splitting", () => {
  it("chips a Large rock with each hit, then splits it across the shot", async () => {
    h.pose((s) => h.debug.addRock(s, "large", 400, 200));
    const id = h.snap().rocks[0].id;
    for (let hit = 1; hit <= 2; hit += 1) {
      h.pose((s) => h.debug.addBullet(s, 400, 300, 0, -600));
      await h.ticks(12);
      expect(h.snap().rocks[0].health).toBe(3 - hit);
      expect(h.snap().score).toBe(0);
    }
    h.pose((s) => h.debug.setRockVelocity(s, id, 0, 0));
    h.pose((s) => h.debug.addBullet(s, 400, 260, 0, -6000));
    await h.ticks(1);
    const s = h.snap();
    expect(s.score).toBe(SCORE_LARGE);
    expect(s.rocks).toHaveLength(2);
    expect(s.rocks.every((r) => r.size === "medium" && r.health === 2)).toBe(
      true,
    );
    expect(s.rocks.every((r) => r.id !== id)).toBe(true);
    expect(Math.abs(s.rocks[0].vx - s.rocks[1].vx)).toBeCloseTo(
      2 * SPLIT_KICK,
      0,
    );
    expect(h.cues).toContain("shatter");
  });

  it("flashes a chipped rock briefly", async () => {
    h.pose((s) => h.debug.addRock(s, "medium", 400, 200));
    h.pose((s) => h.debug.addBullet(s, 400, 240, 0, -600));
    await h.ticks(4);
    expect(h.engine.state.rocks[0].flash).toBeGreaterThan(0);
    await h.ticks(15);
    expect(h.engine.state.rocks[0].flash).toBe(0);
  });

  it("recycles a rock the core swallows, keeping its health", async () => {
    h.pose((s) => h.debug.addRock(s, "large", STAR_X + 70, STAR_Y));
    const id = h.snap().rocks[0].id;
    h.pose((s) => h.debug.setRockHealth(s, id, 1));
    h.pose((s) => h.debug.setNextRecycleEdge(s, "top"));
    h.pose((s) => h.debug.setNextRockSpeed(s, 77));
    await h.ticks(1);
    const [r] = h.snap().rocks;
    expect(r.id).toBe(id);
    expect(r.health).toBe(1);
    expect(r.y).toBeLessThan(5);
    expect(r.vy).toBeGreaterThan(0);
    expect(h.snap().nextRecycleEdge).toBeNull();
    expect(h.snap().nextRockSpeed).toBeNull();
    expect(h.snap().score).toBe(0);
  });
});

describe("the torpedo", () => {
  it("launches once per press on a full charge and recharges over ten seconds", async () => {
    await h.tap("KeyF");
    let s = h.snap();
    expect(s.torpedoes).toHaveLength(1);
    expect(s.torpedoCharge).toBe(0);
    expect(Math.hypot(s.torpedoes[0].vx, s.torpedoes[0].vy)).toBeCloseTo(
      TORPEDO_SPEED,
    );
    await h.tap("KeyF");
    expect(h.snap().torpedoes).toHaveLength(1);
    await h.ticks(599);
    expect(h.snap().torpedoCharge).toBeCloseTo(0.5, 6);
    await h.ticks(600);
    s = h.snap();
    expect(s.torpedoCharge).toBe(1);
    expect(s.torpedoReady).toBe(true);
  });

  it("flies true through the well and destroys a rock outright", async () => {
    h.pose((s) => h.debug.addRock(s, "large", 900, 160));
    h.pose((s) => h.debug.addTorpedo(s, 700, 160, 0));
    await h.ticks(1);
    expect(h.snap().torpedoes[0].vy).toBeCloseTo(0, 6);
    await h.ticks(50);
    const s = h.snap();
    expect(s.torpedoes).toHaveLength(0);
    expect(s.score).toBe(SCORE_LARGE);
    const [a, b] = s.rocks;
    expect(a.vx - b.vx).toBeCloseTo(2 * TORPEDO_SCATTER, 0);
  });

  it("homes onto a body in its forward cone but never one behind it", async () => {
    h.pose((s) => h.debug.addRock(s, "small", 400, 230));
    h.pose((s) => h.debug.addRock(s, "large", 100, 200));
    h.pose((s) => h.debug.addTorpedo(s, 200, 200, 0));
    await h.ticks(10);
    expect(h.snap().torpedoes[0].heading).toBeGreaterThan(0.05);
    h.pose((s) => h.debug.clearTorpedoes(s));
    h.pose((s) => h.debug.addTorpedo(s, 200, 400, 0));
    const id = h.snap().torpedoes[0].id;
    h.pose((s) => h.debug.setTorpedoHoming(s, id, false));
    await h.ticks(10);
    expect(h.snap().torpedoes[0].heading).toBe(0);
  });

  it("passes through the ship and is absorbed by the core", async () => {
    h.pose((s) => h.debug.addTorpedo(s, SAFE_X - 40, SAFE_Y, 0));
    await h.ticks(20);
    expect(h.snap().torpedoes).toHaveLength(1);
    expect(h.snap().lives).toBe(3);
    h.pose((s) => h.debug.addTorpedo(s, STAR_X - 60, STAR_Y, 0));
    await h.ticks(10);
    expect(h.snap().torpedoes).toHaveLength(1);
  });
});

describe("lives", () => {
  it("costs a life on a rock and respawns with grace and a full torpedo", async () => {
    h.pose((s) => h.debug.setTorpedoCharge(s, 0.3));
    h.pose((s) => h.debug.setShipPosition(s, 300, 300));
    h.pose((s) => h.debug.addRock(s, "small", 310, 300));
    await h.ticks(1);
    let s = h.snap();
    expect(s.lives).toBe(2);
    expect(s.ship.x).toBe(SAFE_X);
    expect(s.ship.y).toBe(SAFE_Y);
    expect(s.ship.invuln).toBeCloseTo(INVULN_TIME);
    expect(s.torpedoCharge).toBe(1);
    expect(h.cues).toContain("death");
    h.pose((s2) => h.debug.setShipPosition(s2, 310, 300));
    await h.ticks(1);
    expect(h.snap().lives).toBe(2);
    h.pose((s2) => h.debug.setShipInvuln(s2, 0));
    await h.ticks(1);
    s = h.snap();
    expect(s.lives).toBe(1);
  });

  it("ends the game on the last ship, and ignores contact with the gate shut", async () => {
    h.pose((s) => h.debug.setShipCollision(s, false));
    h.pose((s) => h.debug.addEnemyBullet(s, SAFE_X, SAFE_Y, 0, 0));
    await h.ticks(1);
    expect(h.snap().lives).toBe(3);
    expect(h.snap().enemyBullets).toHaveLength(1);
    h.pose((s) => h.debug.setShipCollision(s, true));
    h.pose((s) => h.debug.setLives(s, 1));
    await h.ticks(1);
    const s = h.snap();
    expect(s.lives).toBe(0);
    expect(s.screen).toBe("gameover");
    expect(s.enemyBullets).toHaveLength(0);
  });
});

describe("waves", () => {
  it("raises the banner on the clearing kill and spawns the next wave as it ends", async () => {
    h.pose((s) => h.debug.setWaveSpawning(s, true));
    h.pose((s) => h.debug.setWave(s, 1));
    h.pose((s) => h.debug.addRock(s, "small", 400, 200));
    h.pose((s) => h.debug.addBullet(s, 400, 240, 0, -600));
    h.pose((s) => h.debug.setNextRockSpeed(s, 100));
    await h.ticks(10);
    let s = h.snap();
    expect(s.score).toBe(SCORE_SMALL);
    expect(s.wave).toBe(2);
    expect(s.waveBanner).toBeGreaterThan(0);
    expect(s.rocks).toHaveLength(0);
    await h.ticks(Math.round(WAVE_BANNER_TIME / TICK_DT));
    s = h.snap();
    expect(s.waveBanner).toBe(0);
    expect(s.rocks).toHaveLength(5);
    for (const r of s.rocks) {
      expect(Math.hypot(r.vx, r.vy)).toBeGreaterThan(100 * 1.04 - 2);
      expect(Math.hypot(r.x - STAR_X, r.y - STAR_Y)).toBeGreaterThanOrEqual(
        190,
      );
    }
    expect(s.nextRockSpeed).toBeNull();
  });

  it("does not clear on a field emptied without a kill", async () => {
    h.pose((s) => h.debug.setWaveSpawning(s, true));
    h.pose((s) => h.debug.setWave(s, 3));
    await h.ticks(10);
    expect(h.snap().wave).toBe(3);
    expect(h.snap().waveBanner).toBe(0);
  });

  it("opens a new game with the wave 1 banner and four rocks behind it", async () => {
    const g = await createHarness();
    await g.tap("Enter");
    expect(g.snap().screen).toBe("playing");
    expect(g.snap().wave).toBe(1);
    await g.ticks(Math.round(WAVE_BANNER_TIME / TICK_DT) + 1);
    const s = g.snap();
    expect(s.rocks).toHaveLength(4);
    for (const r of s.rocks) {
      const speed = Math.hypot(r.vx, r.vy);
      expect(speed).toBeGreaterThan(ROCK_SPEED_MIN.large - 5);
      expect(speed).toBeLessThan(ROCK_SPEED_MAX.large + 5);
    }
  });
});

describe("scoring", () => {
  it("grants an extra ship for each multiple crossed", async () => {
    h.pose((s) => h.debug.setScore(s, 9990));
    expect(h.snap().lives).toBe(3);
    h.pose((s) => h.debug.addRock(s, "small", 400, 200));
    h.pose((s) => h.debug.addBullet(s, 400, 240, 0, -600));
    await h.ticks(10);
    const s = h.snap();
    expect(s.score).toBe(10090);
    expect(s.lives).toBe(4);
    expect(h.cues).toContain("extra-life");
    expect(h.engine.state.extraShipBanner).toBeGreaterThan(0.5 - TICK_DT);
  });
});

describe("the saucer", () => {
  it("arrives on the cadence at a posed edge and row, then leaves on its clock", async () => {
    h.pose((s) => h.debug.setSaucerSpawning(s, true));
    h.pose((s) => h.debug.setSaucerDue(s, 0.5));
    h.pose((s) => h.debug.setNextSaucerEdge(s, "right"));
    h.pose((s) => h.debug.setNextSaucerRow(s, 100));
    await h.ticks(60);
    let s = h.snap();
    expect(s.saucer).not.toBeNull();
    expect(s.saucer?.y).toBe(100);
    expect(s.saucer?.vx).toBe(-SAUCER_SPEED);
    expect(s.nextSaucerEdge).toBeNull();
    expect(h.cues).toContain("saucer");
    const id = s.saucer?.id;
    await h.ticks(Math.round(SAUCER_LIFETIME / TICK_DT));
    s = h.snap();
    expect(s.saucer).toBeNull();
    expect(s.saucerDue).toBeGreaterThanOrEqual(25);
    expect(s.saucerDue).toBeLessThanOrEqual(35);
    expect(id).toBeGreaterThan(0);
  });

  it("weaves, fires aimed shots with the posed error, and dies to a bullet", async () => {
    h.pose((s) => h.debug.addSaucer(s, 200, 150));
    h.pose((s) => h.debug.setNextSaucerAim(s, 0));
    await h.ticks(120);
    let s = h.snap();
    expect(Math.abs(s.saucer?.vy ?? 0)).toBe(SAUCER_WEAVE_SPEED);
    await h.ticks(Math.round((SAUCER_FIRE_INTERVAL - 1) / TICK_DT));
    s = h.snap();
    expect(s.enemyBullets).toHaveLength(1);
    expect(s.nextSaucerAim).toBeNull();
    const shot = s.enemyBullets[0];
    const relative = Math.hypot(
      shot.vx - (s.saucer?.vx ?? 0),
      shot.vy - (s.saucer?.vy ?? 0),
    );
    expect(relative).toBeGreaterThan(SAUCER_BULLET_SPEED - 20);
    const saucer = s.saucer;
    if (saucer === null) throw new Error("saucer expected");
    h.pose((st) => h.debug.addBullet(st, saucer.x, saucer.y + 40, 0, -800));
    await h.ticks(5);
    s = h.snap();
    expect(s.saucer).toBeNull();
    expect(s.score).toBe(SCORE_SAUCER);
  });

  it("steers clear of the core on a crossing lined up with the star", async () => {
    h.pose((s) => h.debug.addSaucer(s, 300, STAR_Y));
    h.pose((s) => h.debug.setSaucerGun(s, false));
    let closest = Infinity;
    for (let i = 0; i < 400; i += 1) {
      await h.ticks(1);
      const sc = h.snap().saucer;
      if (sc)
        closest = Math.min(closest, Math.hypot(sc.x - STAR_X, sc.y - STAR_Y));
    }
    expect(closest).toBeGreaterThanOrEqual(CORE_R + SAUCER_R);
  });

  it("holds still with travel off but keeps its gun", async () => {
    h.pose((s) => h.debug.addSaucer(s, 200, 150));
    h.pose((s) => h.debug.setSaucerTravel(s, false));
    await h.ticks(Math.round(SAUCER_FIRE_INTERVAL / TICK_DT) + 1);
    const s = h.snap();
    expect(s.saucer?.x).toBe(200);
    expect(s.enemyBullets).toHaveLength(1);
  });

  it("is passed through by rocks and kills the ship on contact", async () => {
    h.pose((s) => h.debug.addSaucer(s, 300, 150));
    h.pose((s) => h.debug.addRock(s, "large", 300, 150));
    await h.ticks(2);
    expect(h.snap().saucer).not.toBeNull();
    h.pose((s) => h.debug.setShipPosition(s, h.snap().saucer?.x ?? 0, 150));
    await h.ticks(1);
    expect(h.snap().lives).toBe(2);
  });
});

it("runs whole ticks off any delta and carries the remainder", async () => {
  const g = await createHarness(1000 / 50);
  g.pose((s) => g.debug.setScreen(s, "playing"));
  await g.ticks(5);
  expect(g.snap().simTime).toBeCloseTo(12 * TICK_DT, 9);
  expect(g.engine.state.tickClock).toBeCloseTo(0.1 - 12 * TICK_DT, 9);
});
