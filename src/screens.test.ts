import { beforeEach, describe, expect, it } from "vitest";
import { createHarness, type Harness } from "./test-harness";

let h: Harness;

beforeEach(async () => {
  h = await createHarness();
});

const centre = (h: Harness, i: number): [number, number] => {
  const r = h.debug.menuItemRect(h.engine.state, i);
  if (r === null) throw new Error(`no entry ${i}`);
  return [r.x + r.w / 2, r.y + r.h / 2];
};

describe("the title and how to play", () => {
  it("wraps the highlight at both ends", async () => {
    await h.tap("ArrowUp");
    expect(h.snap().menuIndex).toBe(1);
    await h.tap("KeyS");
    expect(h.snap().menuIndex).toBe(0);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });

  it("opens how to play and returns with its entry highlighted", async () => {
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap().screen).toBe("howto");
    await h.tap("Space");
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
    await h.tap("Enter");
    await h.tap("Escape");
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
  });

  it("starts a game from PLAY", async () => {
    await h.tap("Space");
    expect(h.snap()).toMatchObject({
      screen: "playing",
      lives: 3,
      score: 0,
      wave: 1,
      menuIndex: 0,
    });
  });
});

describe("pausing", () => {
  it("freezes the field and resumes on Escape or P", async () => {
    await h.tap("Enter");
    await h.ticks(30);
    await h.tap("Escape");
    const paused = h.snap();
    expect(paused.screen).toBe("paused");
    await h.ticks(60);
    const later = h.snap();
    expect(later.waveBanner).toBe(paused.waveBanner);
    expect(later.simTime).toBeGreaterThan(paused.simTime);
    await h.tap("Escape");
    expect(h.snap().screen).toBe("playing");
    await h.tap("KeyP");
    await h.tap("KeyP");
    expect(h.snap().screen).toBe("playing");
  });

  it("restarts and quits from the pause menu", async () => {
    await h.tap("Enter");
    h.pose((s) => h.debug.setScore(s, 900));
    await h.tap("KeyP");
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap()).toMatchObject({ screen: "playing", score: 0 });
    await h.tap("KeyP");
    await h.tap("ArrowUp");
    await h.tap("Enter");
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 0 });
  });

  it("stops the thrust loop while paused", async () => {
    await h.tap("Enter");
    const stops: string[] = [];
    h.engine.events.on("cue:stopped", (e) => stops.push(e.cue));
    h.keyDown("ArrowUp");
    await h.ticks(5);
    expect(h.snap().ship.thrusting).toBe(true);
    await h.tap("KeyP");
    expect(h.snap().ship.thrusting).toBe(false);
    expect(stops).toContain("thrust");
  });
});

describe("game over", () => {
  it("offers PLAY AGAIN and MENU, and Escape goes to the menu", async () => {
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("Enter");
    expect(h.snap().screen).toBe("playing");
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("ArrowDown");
    await h.tap("Enter");
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 0 });
    h.pose((s) => h.debug.setScreen(s, "gameover"));
    await h.tap("Escape");
    expect(h.snap().screen).toBe("title");
  });
});

describe("pointer and touch", () => {
  it("highlights on hover and confirms a press and release in one entry", async () => {
    const [x, y] = centre(h, 1);
    h.pointer("pointermove", x, y);
    await h.ticks(1);
    expect(h.snap().menuIndex).toBe(1);
    h.pointer("pointerdown", x, y);
    await h.ticks(1);
    expect(h.snap().screen).toBe("title");
    h.pointer("pointerup", x, y);
    await h.ticks(1);
    expect(h.snap().screen).toBe("howto");
  });

  it("confirms nothing when the press and release fall in different entries", async () => {
    const [x0, y0] = centre(h, 0);
    const [x1, y1] = centre(h, 1);
    h.pointer("pointerdown", x0, y0);
    h.pointer("pointermove", x1, y1);
    h.pointer("pointerup", x1, y1);
    await h.ticks(1);
    expect(h.snap()).toMatchObject({ screen: "title", menuIndex: 1 });
    h.pointer("pointerdown", 5, 5);
    h.pointer("pointerup", 5, 5);
    await h.ticks(1);
    expect(h.snap().screen).toBe("title");
  });

  it("confirms a touch that lands and lifts inside one entry", async () => {
    const [x, y] = centre(h, 0);
    h.pointer("pointerdown", x, y, "touch");
    h.pointer("pointerup", x, y, "touch");
    await h.ticks(1);
    expect(h.snap().screen).toBe("playing");
  });

  it("lets a key confirm win over a pointer confirm on the same frame", async () => {
    const [x, y] = centre(h, 1);
    h.pointer("pointerdown", x, y);
    h.pointer("pointerup", x, y);
    await h.tap("Enter");
    expect(h.snap().screen).toBe("playing");
  });
});

it("toggles mute from any screen", async () => {
  await h.tap("KeyM");
  expect(h.snap().muted).toBe(true);
  await h.tap("Enter");
  await h.tap("KeyM");
  expect(h.snap().muted).toBe(false);
});
