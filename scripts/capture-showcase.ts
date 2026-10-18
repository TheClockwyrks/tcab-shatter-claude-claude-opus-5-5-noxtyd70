// Captures the showcase media from real play.
//
//   node scripts/capture-showcase.ts
//
// It serves the project with Vite, opens `scripts/capture.html` (the game
// exactly as `src/main.ts` stands it up, with the engine reachable from the
// page) in headless Chromium, and plays the game through the keyboard alone: a
// small autopilot reads the field and holds and releases the real keys, so
// everything captured arises from the game's own rules. Nothing is posed
// through the debug surface. Replays are the engine's own draw-command
// recordings, gzipped; screenshots are the page as drawn.

import { writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { chromium, type Page } from "playwright";
import { createServer } from "vite";

const OUT = new URL("../showcase/", import.meta.url);
const PORT = 5287;

interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface View {
  screen: string;
  ship: Body & { angle: number; invuln: number };
  rocks: (Body & { size: string })[];
  saucer: Body | null;
  torpedoCharge: number;
  torpedoes: unknown[];
  wave: number;
  score: number;
  waveBanner: number;
}

declare const window: {
  shatter: {
    state: View;
    startRecording(): void;
    stopRecording(): unknown;
  };
};

const server = await createServer({
  root: new URL("..", import.meta.url).pathname,
  server: { port: PORT },
  logLevel: "error",
});
await server.listen();
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on("pageerror", (e) => console.error("page error:", e.message));
await page.goto(`http://localhost:${PORT}/scripts/capture.html`);
await page.waitForFunction(() => "shatter" in window);

const view = (): Promise<View> => page.evaluate(() => window.shatter.state);

/** Holds exactly the keys in `want`, releasing the rest. */
const held = new Set<string>();
async function hold(want: readonly string[]): Promise<void> {
  for (const key of [...held]) {
    if (!want.includes(key)) {
      await page.keyboard.up(key);
      held.delete(key);
    }
  }
  for (const key of want) {
    if (!held.has(key)) {
      await page.keyboard.down(key);
      held.add(key);
    }
  }
}

function wrapDelta(d: number, size: number): number {
  return ((((d + size / 2) % size) + size) % size) - size / 2;
}

/** What the autopilot shoots at: anything, the rocks alone, or the saucer. */
type Aim = "any" | "rocks" | "saucer";

/**
 * One step of the autopilot: turn toward the best target with a little lead,
 * fire when lined up, thrust away from a rock closing in, and send the torpedo
 * at a Large rock dead ahead.
 */
async function pilot(page: Page, s: View, aim: Aim): Promise<void> {
  const ship = s.ship;
  const targets: Body[] =
    aim === "saucer" && s.saucer !== null ? [s.saucer] : [...s.rocks];
  if (s.saucer !== null && aim === "any") targets.push(s.saucer);
  let best: { angle: number; dist: number; large: boolean } | null = null;
  let threat = false;
  for (const t of targets) {
    const dx = wrapDelta(t.x - ship.x, 1280);
    const dy = wrapDelta(t.y - ship.y, 720);
    const dist = Math.hypot(dx, dy);
    const lead = dist / 520;
    const angle = Math.atan2(dy + t.vy * lead, dx + t.vx * lead);
    if (best === null || dist < best.dist) {
      best = { angle, dist, large: "size" in t && t.size === "large" };
    }
    if (dist < 110 && ship.invuln <= 0) threat = true;
  }
  const keys: string[] = [];
  if (best !== null) {
    const off = Math.atan2(
      Math.sin(best.angle - ship.angle),
      Math.cos(best.angle - ship.angle),
    );
    if (off > 0.06) keys.push("ArrowRight");
    else if (off < -0.06) keys.push("ArrowLeft");
    if (Math.abs(off) < 0.35) keys.push("Space");
    if (
      Math.abs(off) < 0.12 &&
      best.large &&
      best.dist > 160 &&
      s.torpedoCharge >= 1 &&
      s.torpedoes.length === 0
    ) {
      await page.keyboard.press("KeyF");
    }
  }
  const speed = Math.hypot(ship.vx, ship.vy);
  if (threat && speed < 220) keys.push("ArrowUp");
  await hold(keys);
}

/** Plays for `ms` of real time, or until `until` holds. */
async function play(
  ms: number,
  until: (s: View) => boolean = () => false,
  aim: Aim = "any",
): Promise<View> {
  const end = Date.now() + ms;
  let s = await view();
  while (Date.now() < end && !until(s)) {
    if (s.screen !== "playing") break;
    await pilot(page, s, aim);
    await page.waitForTimeout(30);
    s = await view();
  }
  return s;
}

/** Records the plays in `script` as one replay. */
async function record(
  name: string,
  script: readonly (readonly [number, Aim])[],
): Promise<void> {
  await page.evaluate(() => window.shatter.startRecording());
  for (const [ms, aim] of script) await play(ms, () => false, aim);
  const json = await page.evaluate(() =>
    JSON.stringify(window.shatter.stopRecording()),
  );
  const gz = gzipSync(json, { level: 9 });
  writeFileSync(new URL(name, OUT), gz);
  console.log(`${name}: ${(gz.length / 1024).toFixed(0)} KiB gzipped`);
}

// The title screen, as the game opens.
await page.waitForTimeout(1500);
await page.screenshot({ path: new URL("title.png", OUT).pathname });

// A new game: let the wave 1 banner run, then play into the field.
await page.keyboard.press("Enter");
await page.waitForTimeout(1700);
await play(2500);
await record("shatter.json.gz", [[7000, "rocks"]]);

// Live play, as a still.
await play(1200);
await hold([]);
await page.screenshot({ path: new URL("field.png", OUT).pathname });

// Keep playing until the saucer comes in to hunt, then record its visit: a
// few seconds of it stalking the ship before the autopilot turns on it.
const s = await play(40_000, (v) => v.saucer !== null, "rocks");
if (s.saucer !== null) {
  await record("saucer.json.gz", [
    [3500, "rocks"],
    [3500, "saucer"],
  ]);
} else console.error("no saucer arrived; saucer.json.gz not captured");

await hold([]);
await browser.close();
await server.close();
