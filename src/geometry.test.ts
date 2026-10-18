import { describe, expect, it } from "vitest";
import { MU, SOFTEN, STAR_X, STAR_Y } from "./constants";
import {
  gravityAt,
  normalizeAngle,
  separation,
  sweptContact,
  wrapAxis,
  wrapDeltaAxis,
  wrappedDistance,
} from "./geometry";

describe("the wrap", () => {
  it("brings coordinates into the field", () => {
    expect(wrapAxis(1290, 1280)).toBe(10);
    expect(wrapAxis(-5, 1280)).toBe(1275);
    expect(wrapAxis(1280, 1280)).toBe(0);
    expect(wrapAxis(640, 1280)).toBe(640);
  });

  it("takes the shortest separation across the seams", () => {
    expect(wrapDeltaAxis(1270, 1280)).toBe(-10);
    expect(wrapDeltaAxis(-1270, 1280)).toBe(10);
    expect(wrapDeltaAxis(640, 1280)).toBe(-640);
    expect(separation(5, 5, 1275, 715)).toEqual({ x: -10, y: -10 });
    expect(wrappedDistance(0, 360, 1270, 360)).toBeCloseTo(10);
  });
});

describe("the pull", () => {
  it("follows the inverse square outside the softening radius", () => {
    expect(
      Math.hypot(...Object.values(gravityAt(STAR_X + 200, STAR_Y))),
    ).toBeCloseTo(112.5);
    expect(gravityAt(STAR_X, STAR_Y - 150).y).toBeCloseTo(200);
    expect(gravityAt(STAR_X + 120, STAR_Y).x).toBeCloseTo(-312.5);
  });

  it("is capped inside the softening radius and zero at the centre", () => {
    const cap = MU / (SOFTEN * SOFTEN);
    expect(gravityAt(STAR_X + 40, STAR_Y).x).toBeCloseTo(-cap);
    expect(gravityAt(STAR_X, STAR_Y)).toEqual({ x: 0, y: 0 });
  });

  it("uses the direct vector rather than a wrapped one", () => {
    const a = gravityAt(5, 5);
    expect(a.x).toBeGreaterThan(0);
    expect(a.y).toBeGreaterThan(0);
  });
});

describe("swept contact", () => {
  it("finds a contact a fast body would tunnel through", () => {
    const bullet = { x: 200, y: 100, mx: 200, my: 0 };
    const still = { x: 100, y: 100, mx: 0, my: 0 };
    expect(sweptContact(bullet, still, 5)).toBeCloseTo(0.475);
  });

  it("reports overlap at the start of the tick as zero", () => {
    expect(
      sweptContact(
        { x: 0, y: 0, mx: 0, my: 0 },
        { x: 3, y: 0, mx: 0, my: 0 },
        5,
      ),
    ).toBe(0);
  });

  it("finds contacts across a seam and misses wide passes", () => {
    const a = { x: 1278, y: 300, mx: 0, my: 0 };
    const b = { x: 2, y: 300, mx: 0, my: 0 };
    expect(sweptContact(a, b, 5)).toBe(0);
    const miss = { x: 200, y: 140, mx: 200, my: 0 };
    expect(sweptContact(miss, { x: 100, y: 100, mx: 0, my: 0 }, 5)).toBeNull();
    expect(
      sweptContact(
        { x: 0, y: 0, mx: 0, my: 0 },
        { x: 50, y: 0, mx: 0, my: 0 },
        5,
      ),
    ).toBeNull();
  });
});

it("normalizes angles into (-PI, PI]", () => {
  expect(normalizeAngle(3 * Math.PI)).toBeCloseTo(Math.PI);
  expect(normalizeAngle(-3 * Math.PI)).toBeCloseTo(Math.PI);
  expect(normalizeAngle(0.5)).toBe(0.5);
});
