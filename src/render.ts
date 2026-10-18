// The drawing: every screen, drawn in logical units from the state alone. The
// renderer reads the state and never writes it; nothing here is read back by
// the simulation.

import type { DeepReadonly } from "ts-essentials";
import {
  BULLET_LIFE,
  BULLET_R,
  CORE_R,
  FIELD_H,
  FIELD_W,
  HALO_R,
  HIT_FLASH_TIME,
  ROCK_HEALTH,
  ROCK_RADIUS,
  SAUCER_BULLET_LIFE,
  SAUCER_BULLET_R,
  SAUCER_R,
  SHIP_R,
  STAR_X,
  STAR_Y,
  TAGLINE_TEXT,
  TICK_DT,
  TITLE_TEXT,
  TORPEDO_R,
  TRAIL_TICKS,
  type RockSize,
} from "./constants";
import type {
  BulletState,
  RockState,
  SaucerState,
  ShatterState,
  ShipState,
  TorpedoState,
} from "./game";
import { gravityAt, wrapAxis } from "./geometry";
import { itemRect, menuItems } from "./screens";

type Ctx = CanvasRenderingContext2D;
type View = DeepReadonly<ShatterState>;

const FONT = "'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
const DISPLAY_FONT = "'Arial Black', 'Helvetica Neue', Impact, sans-serif";

const COLORS = {
  text: "#e8ecff",
  dim: "#8a93b8",
  accent: "#6ff3ff",
  ship: "#7ff6ff",
  shipHull: "#0d2a3a",
  bullet: "#fff3b0",
  enemyBullet: "#ff4f8b",
  torpedo: "#ff8a3d",
  saucer: "#a6ff5c",
  rockFill: "#3e3a52",
  rockEdge: "#a9a1c9",
};

/** Draws the frame for whatever screen the state shows. */
export function renderGame(state: View, ctx: Ctx): void {
  drawSpace(ctx);
  drawStar(ctx, state.simTime);

  switch (state.screen) {
    case "title":
      drawTitleDrift(ctx, state.simTime);
      drawTitle(ctx, state);
      return;
    case "howto":
      drawHowTo(ctx);
      return;
    case "playing":
      drawField(ctx, state);
      drawHud(ctx, state);
      drawBanners(ctx, state);
      return;
    case "paused":
      drawField(ctx, state);
      drawHud(ctx, state);
      drawPaused(ctx, state);
      return;
    case "gameover":
      drawField(ctx, state);
      drawGameOver(ctx, state);
      return;
  }
}

// ---- Helpers -------------------------------------------------------------

/** A repeatable pseudo-random value in `[0, 1)` from two integers. */
function hash(a: number, b: number): number {
  const h = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return h - Math.floor(h);
}

/**
 * Calls `draw` at `(x, y)` and at each wrapped duplicate a body of `reach`
 * shows across a seam.
 */
function wrapped(
  x: number,
  y: number,
  reach: number,
  draw: (x: number, y: number) => void,
): void {
  const xs = [x];
  if (x < reach) xs.push(x + FIELD_W);
  if (x > FIELD_W - reach) xs.push(x - FIELD_W);
  const ys = [y];
  if (y < reach) ys.push(y + FIELD_H);
  if (y > FIELD_H - reach) ys.push(y - FIELD_H);
  for (const px of xs) for (const py of ys) draw(px, py);
}

function text(
  ctx: Ctx,
  value: string,
  x: number,
  y: number,
  font: string,
  color: string,
  align: CanvasTextAlign = "center",
): void {
  ctx.font = font;
  ctx.textAlign = align;
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(value, x, y);
}

// ---- Space and the star --------------------------------------------------

function drawSpace(ctx: Ctx): void {
  for (let i = 0; i < 140; i += 1) {
    const x = hash(i, 1) * FIELD_W;
    const y = hash(i, 2) * FIELD_H;
    const b = hash(i, 3);
    ctx.fillStyle = `rgba(200, 210, 255, ${(0.15 + b * 0.45).toFixed(2)})`;
    const size = b > 0.85 ? 2 : 1.2;
    ctx.fillRect(x, y, size, size);
  }
}

function drawStar(ctx: Ctx, time: number): void {
  const pulse = 1 + 0.06 * Math.sin(time * 2.2);
  const halo = ctx.createRadialGradient(
    STAR_X,
    STAR_Y,
    CORE_R,
    STAR_X,
    STAR_Y,
    HALO_R * 1.5,
  );
  halo.addColorStop(0, `rgba(255, 196, 110, ${(0.55 * pulse).toFixed(3)})`);
  halo.addColorStop(0.25, "rgba(255, 140, 70, 0.22)");
  halo.addColorStop(0.6, "rgba(200, 80, 60, 0.07)");
  halo.addColorStop(1, "rgba(120, 40, 60, 0)");
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, HALO_R * 1.5, 0, Math.PI * 2);
  ctx.fill();

  const core = ctx.createRadialGradient(
    STAR_X - 6,
    STAR_Y - 6,
    2,
    STAR_X,
    STAR_Y,
    CORE_R,
  );
  core.addColorStop(0, "#ffffff");
  core.addColorStop(0.45, "#fff2c4");
  core.addColorStop(0.85, "#ffc061");
  core.addColorStop(1, "#ff9a3c");
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(STAR_X, STAR_Y, CORE_R, 0, Math.PI * 2);
  ctx.fill();
}

// ---- The field -----------------------------------------------------------

function drawField(ctx: Ctx, state: View): void {
  for (const rock of state.rocks) drawRock(ctx, rock);
  for (const d of state.debris) {
    const a = Math.max(0, d.life / d.maxLife);
    ctx.fillStyle = `hsla(${d.hue}, 100%, ${50 + 30 * a}%, ${a.toFixed(3)})`;
    ctx.fillRect(d.x - 1.5, d.y - 1.5, 3, 3);
  }
  for (const b of state.bullets) {
    drawShot(ctx, b, BULLET_LIFE, BULLET_R, COLORS.bullet, "255, 236, 150");
  }
  for (const b of state.enemyBullets) {
    drawShot(
      ctx,
      b,
      SAUCER_BULLET_LIFE,
      SAUCER_BULLET_R,
      COLORS.enemyBullet,
      "255, 79, 139",
    );
  }
  for (const t of state.torpedoes) drawTorpedo(ctx, t, state.simTime);
  if (state.saucer !== null) drawSaucer(ctx, state.saucer, state.simTime);
  if (state.lives > 0) drawShip(ctx, state.ship, state.simTime);
}

/** A rock's outline: a jagged ring of points, fixed by its id. */
function rockOutline(id: number, size: RockSize): readonly [number, number][] {
  const n = size === "large" ? 12 : size === "medium" ? 10 : 8;
  const r = ROCK_RADIUS[size];
  const points: [number, number][] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2 + (hash(id, i + 40) - 0.5) * 0.35;
    const k = 0.78 + hash(id, i) * 0.3;
    points.push([Math.cos(a) * r * k, Math.sin(a) * r * k]);
  }
  return points;
}

function drawRock(ctx: Ctx, rock: DeepReadonly<RockState>): void {
  const r = ROCK_RADIUS[rock.size];
  const outline = rockOutline(rock.id, rock.size);
  const full = ROCK_HEALTH[rock.size];
  const damage = (full - rock.health) / full;
  const flash = Math.min(1, rock.flash / HIT_FLASH_TIME);

  wrapped(rock.x, rock.y, r + 4, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rock.spin);

    ctx.beginPath();
    outline.forEach(([px, py], i) =>
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py),
    );
    ctx.closePath();
    const shade = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 2, 0, 0, r);
    shade.addColorStop(0, damage > 0 ? "#5a3f45" : "#575170");
    shade.addColorStop(1, damage > 0 ? "#2a1c24" : COLORS.rockFill);
    ctx.fillStyle = shade;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle =
      damage === 0 ? COLORS.rockEdge : damage < 0.5 ? "#d49a7a" : "#ff7a4a";
    ctx.stroke();

    if (damage > 0) drawCracks(ctx, rock.id, r, full - rock.health);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(0.85 * flash).toFixed(3)})`;
      ctx.fill();
    }
    ctx.restore();
  });
}

/** Glowing fissures, one set per hit the rock has taken. */
function drawCracks(ctx: Ctx, id: number, r: number, hits: number): void {
  ctx.lineCap = "round";
  for (let h = 0; h < hits; h += 1) {
    const a0 = hash(id, 90 + h) * Math.PI * 2;
    ctx.beginPath();
    let x = Math.cos(a0) * r * 0.85;
    let y = Math.sin(a0) * r * 0.85;
    ctx.moveTo(x, y);
    for (let k = 0; k < 4; k += 1) {
      const a = a0 + Math.PI + (hash(id, 100 + h * 7 + k) - 0.5) * 1.6;
      x += Math.cos(a) * r * 0.32;
      y += Math.sin(a) * r * 0.32;
      ctx.lineTo(x, y);
    }
    ctx.strokeStyle = "rgba(255, 150, 80, 0.35)";
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.strokeStyle = "#ffb070";
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
}

/**
 * The recent path of a shot, rebuilt by running its flight backwards: the
 * same tick integration the simulation stepped it with, undone tick by tick,
 * for as many of the last `TRAIL_TICKS` ticks as the shot has been in flight.
 * Points are unwrapped, so the tail follows the shot across a seam.
 */
function trailOf(
  b: DeepReadonly<BulletState>,
  fullLife: number,
): readonly [number, number][] {
  const alive = Math.round((fullLife - b.life) / TICK_DT);
  const ticks = Math.max(0, Math.min(TRAIL_TICKS, alive));
  let x = b.x;
  let y = b.y;
  let vx = b.vx;
  let vy = b.vy;
  const points: [number, number][] = [[x, y]];
  for (let i = 0; i < ticks; i += 1) {
    x -= vx * TICK_DT;
    y -= vy * TICK_DT;
    const a = gravityAt(wrapAxis(x, FIELD_W), wrapAxis(y, FIELD_H));
    vx -= a.x * TICK_DT;
    vy -= a.y * TICK_DT;
    points.push([x, y]);
  }
  return points;
}

function drawShot(
  ctx: Ctx,
  b: DeepReadonly<BulletState>,
  fullLife: number,
  radius: number,
  color: string,
  rgb: string,
): void {
  const trail = trailOf(b, fullLife);
  let reach = radius + 2;
  for (const [px, py] of trail) {
    reach = Math.max(reach, Math.abs(px - b.x) + 4, Math.abs(py - b.y) + 4);
  }
  wrapped(b.x, b.y, reach, (x, y) => {
    const ox = x - b.x;
    const oy = y - b.y;
    if (trail.length > 1) drawTail(ctx, trail, ox, oy, radius, rgb);
    ctx.fillStyle = `rgba(${rgb}, 0.25)`;
    ctx.beginPath();
    ctx.arc(x, y, radius * 2.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fill();
  });
}

/**
 * A comet tail along `trail` (head first): one filled strip, widest at the
 * head and tapering to a point at the oldest end, fading out along a gradient.
 */
function drawTail(
  ctx: Ctx,
  trail: readonly [number, number][],
  ox: number,
  oy: number,
  radius: number,
  rgb: string,
): void {
  const n = trail.length - 1;
  const left: [number, number][] = [];
  const right: [number, number][] = [];
  for (let i = 0; i <= n; i += 1) {
    const [ax, ay] = trail[Math.max(0, i - 1)];
    const [bx, by] = trail[Math.min(n, i + 1)];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const nx = -(by - ay) / len;
    const ny = (bx - ax) / len;
    const w = radius * 1.1 * (1 - i / n);
    const [px, py] = trail[i];
    left.push([px + ox + nx * w, py + oy + ny * w]);
    right.push([px + ox - nx * w, py + oy - ny * w]);
  }
  const [hx, hy] = trail[0];
  const [tx, ty] = trail[n];
  const fade = ctx.createLinearGradient(hx + ox, hy + oy, tx + ox, ty + oy);
  fade.addColorStop(0, `rgba(${rgb}, 0.95)`);
  fade.addColorStop(0.5, `rgba(${rgb}, 0.4)`);
  fade.addColorStop(1, `rgba(${rgb}, 0)`);
  ctx.fillStyle = fade;
  ctx.beginPath();
  left.forEach(([px, py], i) =>
    i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py),
  );
  for (let i = right.length - 1; i >= 0; i -= 1)
    ctx.lineTo(right[i][0], right[i][1]);
  ctx.closePath();
  ctx.fill();
}

function drawTorpedo(
  ctx: Ctx,
  t: DeepReadonly<TorpedoState>,
  time: number,
): void {
  wrapped(t.x, t.y, 40, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(t.heading);
    const flicker = 0.75 + 0.25 * Math.sin(time * 60);
    ctx.fillStyle = `rgba(255, 120, 40, ${(0.5 * flicker).toFixed(3)})`;
    ctx.beginPath();
    ctx.moveTo(-6, -4);
    ctx.lineTo(-28 * flicker, 0);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(255, 138, 61, 0.22)";
    ctx.beginPath();
    ctx.arc(0, 0, TORPEDO_R * 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = COLORS.torpedo;
    ctx.strokeStyle = "#fff0dc";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-6, -6);
    ctx.lineTo(-3, 0);
    ctx.lineTo(-6, 6);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
    ctx.strokeStyle = `rgba(255, 170, 90, ${(0.4 + 0.3 * Math.sin(time * 14)).toFixed(3)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, TORPEDO_R * 2 + 3 * Math.sin(time * 14), 0, Math.PI * 2);
    ctx.stroke();
  });
}

function drawSaucer(
  ctx: Ctx,
  saucer: DeepReadonly<SaucerState>,
  time: number,
): void {
  wrapped(saucer.x, saucer.y, SAUCER_R + 12, (x, y) => {
    const r = SAUCER_R;
    ctx.fillStyle = "rgba(166, 255, 92, 0.12)";
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.9, r * 1.1, 0, 0, Math.PI * 2);
    ctx.fill();
    // Dome.
    ctx.fillStyle = "rgba(190, 255, 230, 0.85)";
    ctx.beginPath();
    ctx.ellipse(x, y - r * 0.3, r * 0.55, r * 0.55, 0, Math.PI, 0);
    ctx.fill();
    // Hull.
    ctx.fillStyle = "#1d3a14";
    ctx.strokeStyle = COLORS.saucer;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x, y, r * 1.35, r * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Running lights.
    for (let i = 0; i < 5; i += 1) {
      const on = Math.floor(time * 8 + i) % 5 === 0;
      ctx.fillStyle = on ? "#ffffff" : COLORS.saucer;
      ctx.beginPath();
      ctx.arc(x - r * 0.9 + i * r * 0.45, y + 1, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

function drawShip(ctx: Ctx, ship: DeepReadonly<ShipState>, time: number): void {
  const graced = ship.invuln > 0;
  const blink = graced && Math.floor(ship.invuln * 10) % 2 === 0;
  wrapped(ship.x, ship.y, SHIP_R + 24, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    if (graced) {
      ctx.strokeStyle = `rgba(120, 220, 255, ${(0.35 + 0.25 * Math.sin(time * 18)).toFixed(3)})`;
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.arc(0, 0, SHIP_R + 9, time * 2, time * 2 + Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.rotate(ship.angle);
    ctx.globalAlpha = blink ? 0.35 : 1;
    if (ship.thrusting) {
      const len = 16 + 8 * Math.abs(Math.sin(time * 47));
      ctx.fillStyle = "rgba(255, 150, 50, 0.85)";
      ctx.beginPath();
      ctx.moveTo(-12, -6);
      ctx.lineTo(-12 - len, 0);
      ctx.lineTo(-12, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "rgba(255, 245, 190, 0.95)";
      ctx.beginPath();
      ctx.moveTo(-12, -3);
      ctx.lineTo(-12 - len * 0.55, 0);
      ctx.lineTo(-12, 3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(-14, -13);
    ctx.lineTo(-8, 0);
    ctx.lineTo(-14, 13);
    ctx.closePath();
    ctx.fillStyle = COLORS.shipHull;
    ctx.fill();
    ctx.strokeStyle = graced ? "#c8f4ff" : COLORS.ship;
    ctx.lineWidth = 2.2;
    ctx.lineJoin = "round";
    ctx.stroke();
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(9, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// ---- The HUD and the banners --------------------------------------------

function shipGlyph(ctx: Ctx, x: number, y: number): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-Math.PI / 2);
  ctx.beginPath();
  ctx.moveTo(10, 0);
  ctx.lineTo(-7, -7);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-7, 7);
  ctx.closePath();
  ctx.fillStyle = COLORS.shipHull;
  ctx.fill();
  ctx.strokeStyle = COLORS.ship;
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.restore();
}

function drawHud(ctx: Ctx, state: View): void {
  text(
    ctx,
    String(state.score),
    28,
    44,
    `bold 38px ${DISPLAY_FONT}`,
    COLORS.text,
    "left",
  );

  for (let i = 0; i < Math.max(0, state.lives - 1); i += 1) {
    shipGlyph(ctx, 40 + i * 26, 88);
  }

  const charge = state.torpedoCharge;
  const ready = charge >= 1;
  ctx.save();
  ctx.translate(40, 122);
  ctx.globalAlpha = ready ? 1 : 0.35;
  ctx.fillStyle = COLORS.torpedo;
  ctx.beginPath();
  ctx.moveTo(12, 0);
  ctx.lineTo(-8, -6);
  ctx.lineTo(-4, 0);
  ctx.lineTo(-8, 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  text(
    ctx,
    ready ? "TORPEDO READY" : "TORPEDO",
    62,
    122,
    `bold 13px ${FONT}`,
    ready ? COLORS.torpedo : COLORS.dim,
    "left",
  );
  ctx.fillStyle = "rgba(255, 255, 255, 0.12)";
  ctx.fillRect(28, 138, 120, 6);
  ctx.fillStyle = ready ? COLORS.torpedo : "#b8653a";
  ctx.fillRect(28, 138, 120 * Math.max(0, Math.min(1, charge)), 6);

  text(
    ctx,
    `WAVE ${state.wave}`,
    FIELD_W - 28,
    40,
    `bold 20px ${FONT}`,
    COLORS.dim,
    "right",
  );
}

function drawBanners(ctx: Ctx, state: View): void {
  if (state.waveBanner > 0) {
    const a = Math.min(1, state.waveBanner / 0.2);
    ctx.fillStyle = `rgba(4, 5, 13, ${(0.55 * a).toFixed(3)})`;
    ctx.fillRect(0, STAR_Y - 46, FIELD_W, 92);
    ctx.globalAlpha = a;
    text(
      ctx,
      `WAVE ${state.wave}`,
      STAR_X,
      STAR_Y,
      `bold 64px ${DISPLAY_FONT}`,
      COLORS.text,
    );
    ctx.globalAlpha = 1;
  }
  if (state.extraShipBanner > 0) {
    const pulse = 0.7 + 0.3 * Math.sin(state.simTime * 16);
    ctx.globalAlpha = Math.min(1, state.extraShipBanner * 3) * pulse;
    text(ctx, "EXTRA SHIP", STAR_X, 70, `bold 34px ${DISPLAY_FONT}`, "#9dffb0");
    ctx.globalAlpha = 1;
  }
}

// ---- Menus and screens --------------------------------------------------

function drawMenu(ctx: Ctx, state: View): void {
  const items = menuItems(state.screen);
  items.forEach((label, i) => {
    const r = itemRect(state.screen, i);
    if (r === null) return;
    const on = i === state.menuIndex;
    ctx.fillStyle = on ? "rgba(111, 243, 255, 0.18)" : "rgba(10, 14, 32, 0.75)";
    ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.strokeStyle = on ? COLORS.accent : "rgba(138, 147, 184, 0.45)";
    ctx.lineWidth = on ? 2.5 : 1.5;
    ctx.strokeRect(r.x, r.y, r.w, r.h);
    text(
      ctx,
      on ? `▸  ${label}  ◂` : label,
      r.x + r.w / 2,
      r.y + r.h / 2 + 1,
      `bold 22px ${FONT}`,
      on ? "#ffffff" : COLORS.dim,
    );
  });
}

function veil(ctx: Ctx, alpha: number): void {
  ctx.fillStyle = `rgba(3, 4, 12, ${alpha})`;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);
}

/** Dim rocks wheeling around the star behind the title, from the clock alone. */
function drawTitleDrift(ctx: Ctx, time: number): void {
  ctx.globalAlpha = 0.35;
  for (let i = 0; i < 6; i += 1) {
    const size: RockSize =
      i % 3 === 0 ? "large" : i % 3 === 1 ? "medium" : "small";
    const orbit = 230 + hash(i, 7) * 300;
    const a = hash(i, 8) * Math.PI * 2 + time * (0.05 + hash(i, 9) * 0.06);
    drawRock(ctx, {
      id: 1000 + i,
      x: wrapAxis(STAR_X + Math.cos(a) * orbit * 1.4, FIELD_W),
      y: wrapAxis(STAR_Y + Math.sin(a) * orbit * 0.7, FIELD_H),
      vx: 0,
      vy: 0,
      size,
      spin: time * (0.2 + i * 0.05),
      health: ROCK_HEALTH[size],
      flash: 0,
    });
  }
  ctx.globalAlpha = 1;
}

function drawTitle(ctx: Ctx, state: View): void {
  veil(ctx, 0.35);
  ctx.save();
  ctx.shadowColor = "rgba(111, 243, 255, 0.6)";
  ctx.shadowBlur = 24;
  text(ctx, TITLE_TEXT, STAR_X, 200, `bold 120px ${DISPLAY_FONT}`, "#f4f7ff");
  ctx.restore();
  text(ctx, TAGLINE_TEXT, STAR_X, 290, `bold 22px ${FONT}`, COLORS.accent);
  drawMenu(ctx, state);
  text(
    ctx,
    "ARROWS / WASD  choose     ENTER  confirm     M  mute",
    STAR_X,
    FIELD_H - 40,
    `15px ${FONT}`,
    COLORS.dim,
  );
}

const HOWTO_LINES: readonly string[] = [
  "Shoot every rock down through its fragments to clear the wave. Each cleared",
  "wave brings a denser, faster one.",
  "The star pulls your bullets and the rocks, but never your ship, so your shots",
  "bend around it. Curve a shot past the star to hit a rock hiding behind it.",
  "A rock the star swallows is not gone: it comes back from the edge of the field.",
  "Larger rocks are armored and take several hits to break. Cracks show the damage.",
  "Watch for the saucer: it arrives to hunt you, and you can shoot it down.",
  "Your torpedo is a single guided shot on a ten-second recharge. It homes onto the",
  "nearest body in a narrow cone ahead, flies true through the well, and destroys",
  "any rock outright.",
];

const CONTROL_LINES: readonly (readonly [string, string])[] = [
  ["ARROWS or WASD", "turn left and right, thrust with up"],
  ["SPACE", "fire the gun"],
  ["F", "launch the torpedo"],
  ["P or ESC", "pause"],
  ["M", "mute"],
  ["ENTER", "confirm on a menu"],
];

function drawHowTo(ctx: Ctx): void {
  veil(ctx, 0.72);
  text(ctx, "HOW TO PLAY", STAR_X, 62, `bold 40px ${DISPLAY_FONT}`, "#f4f7ff");
  HOWTO_LINES.forEach((line, i) => {
    text(ctx, line, 150, 120 + i * 30, `19px ${FONT}`, COLORS.text, "left");
  });
  CONTROL_LINES.forEach(([key, what], i) => {
    const y = 450 + i * 32;
    text(ctx, key, 470, y, `bold 19px ${FONT}`, COLORS.accent, "right");
    text(ctx, what, 500, y, `19px ${FONT}`, COLORS.text, "left");
  });
  text(
    ctx,
    "Press ENTER or ESC to return",
    STAR_X,
    FIELD_H - 34,
    `bold 17px ${FONT}`,
    COLORS.dim,
  );
}

function drawPaused(ctx: Ctx, state: View): void {
  veil(ctx, 0.6);
  text(ctx, "PAUSED", STAR_X, 220, `bold 64px ${DISPLAY_FONT}`, "#f4f7ff");
  drawMenu(ctx, state);
}

function drawGameOver(ctx: Ctx, state: View): void {
  veil(ctx, 0.65);
  text(ctx, "GAME OVER", STAR_X, 210, `bold 80px ${DISPLAY_FONT}`, "#ff8a8a");
  text(
    ctx,
    `SCORE  ${state.score}`,
    STAR_X,
    310,
    `bold 34px ${FONT}`,
    COLORS.text,
  );
  text(
    ctx,
    `REACHED WAVE ${state.wave}`,
    STAR_X,
    362,
    `bold 22px ${FONT}`,
    COLORS.accent,
  );
  drawMenu(ctx, state);
}
