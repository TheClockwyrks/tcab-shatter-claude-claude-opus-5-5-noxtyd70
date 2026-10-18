// Geometry of the wrapping field: the torus wrap, the shortest wrapped
// separation, the star's pull, and the swept contact test every collision uses.

import { FIELD_H, FIELD_W, MU, SOFTEN, STAR_X, STAR_Y } from "./constants";

export interface Vec {
  readonly x: number;
  readonly y: number;
}

/** Brings one coordinate into `[0, size)`. */
export function wrapAxis(value: number, size: number): number {
  const r = value % size;
  return r < 0 ? r + size : r === size ? 0 : r;
}

/** Brings a difference along one axis into `[-size / 2, +size / 2)`. */
export function wrapDeltaAxis(delta: number, size: number): number {
  const half = size / 2;
  let d = delta % size;
  if (d < -half) d += size;
  else if (d >= half) d -= size;
  return d;
}

/** The shortest wrapped separation from `a` to `b`. */
export function separation(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): Vec {
  return {
    x: wrapDeltaAxis(bx - ax, FIELD_W),
    y: wrapDeltaAxis(by - ay, FIELD_H),
  };
}

/** The shortest wrapped distance between two positions. */
export function wrappedDistance(
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const d = separation(ax, ay, bx, by);
  return Math.hypot(d.x, d.y);
}

/**
 * The star's pull on a body at `(x, y)`, taken along the direct (unwrapped)
 * vector to the star and capped inside the softening radius.
 */
export function gravityAt(x: number, y: number): Vec {
  const dx = STAR_X - x;
  const dy = STAR_Y - y;
  const d = Math.hypot(dx, dy);
  if (d === 0) return { x: 0, y: 0 };
  const dEff = Math.max(d, SOFTEN);
  const a = MU / (dEff * dEff);
  return { x: (a * dx) / d, y: (a * dy) / d };
}

/** A body's motion over one tick: where it ended and how far it moved. */
export interface Motion {
  readonly x: number;
  readonly y: number;
  readonly mx: number;
  readonly my: number;
}

/**
 * The earliest fraction of the tick, in `[0, 1]`, at which two moving circles
 * come within `reach` of each other, or `null` when they never do. Each body
 * travels linearly from `end - move` to `end`; the separation is the shortest
 * wrapped one, so a contact across a seam is found like any other.
 */
export function sweptContact(
  a: Motion,
  b: Motion,
  reach: number,
): number | null {
  const d0 = separation(a.x - a.mx, a.y - a.my, b.x - b.mx, b.y - b.my);
  const c = d0.x * d0.x + d0.y * d0.y - reach * reach;
  if (c <= 0) return 0;
  const rx = b.mx - a.mx;
  const ry = b.my - a.my;
  const qa = rx * rx + ry * ry;
  if (qa === 0) return null;
  const qb = 2 * (d0.x * rx + d0.y * ry);
  const disc = qb * qb - 4 * qa * c;
  if (disc < 0) return null;
  const t = (-qb - Math.sqrt(disc)) / (2 * qa);
  return t >= 0 && t <= 1 ? t : null;
}

/** An angle brought into `(-PI, PI]`. */
export function normalizeAngle(angle: number): number {
  let a = angle % (2 * Math.PI);
  if (a <= -Math.PI) a += 2 * Math.PI;
  else if (a > Math.PI) a -= 2 * Math.PI;
  return a;
}
