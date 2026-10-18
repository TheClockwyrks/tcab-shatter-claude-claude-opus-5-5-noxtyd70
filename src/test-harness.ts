// A headless engine for the unit tests: the real engine over a native canvas,
// a constant clock of the test's own, and an event target to dispatch keys and
// pointer events at. Nothing here ships in the build.

import { createCanvas } from "@napi-rs/canvas";
import { ConstantClock, createEngine } from "@clockwyrks/simple-2d";
import type { Engine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "./constants";
import {
  BACKGROUND,
  game,
  type ShatterDebugApi,
  type ShatterState,
} from "./game";

export interface Harness {
  readonly engine: Engine<ShatterState, ShatterDebugApi>;
  readonly debug: ShatterDebugApi;
  /** Applies a pose to the engine's state. */
  pose(
    change: (s: Parameters<ShatterDebugApi["snapshot"]>[0]) => ShatterState,
  ): void;
  snap(): ReturnType<ShatterDebugApi["snapshot"]>;
  /** Runs `frames` frames of `1 / 120` second each: one tick per frame. */
  ticks(frames: number): Promise<void>;
  keyDown(code: string): void;
  keyUp(code: string): void;
  /** Presses and releases a key across one frame. */
  tap(code: string): Promise<void>;
  pointer(
    type: "pointerdown" | "pointermove" | "pointerup",
    x: number,
    y: number,
    kind?: string,
  ): void;
  /** Every cue played, in order. */
  readonly cues: string[];
  readonly loops: string[];
}

export async function createHarness(stepMs = 1000 / 120): Promise<Harness> {
  const canvas = createCanvas(FIELD_W, FIELD_H);
  const target = new EventTarget();
  const engine = createEngine({
    canvas: canvas as unknown as HTMLCanvasElement,
    width: FIELD_W,
    height: FIELD_H,
    game,
    background: BACKGROUND,
    layout: LAYOUT,
    clock: new ConstantClock(stepMs),
    surface: {
      cssWidth: () => FIELD_W,
      cssHeight: () => FIELD_H,
      dpr: () => 1,
      events: () => target,
    },
  });
  const cues: string[] = [];
  const loops: string[] = [];
  engine.events.on("cue:played", (e) => cues.push(e.cue));
  engine.events.on("cue:looped", (e) => loops.push(e.cue));
  await engine.initialize();
  const debug = engine.debug;

  const key = (type: string, code: string): void => {
    target.dispatchEvent(
      Object.assign(new Event(type), { code, repeat: false }),
    );
  };

  return {
    engine,
    debug,
    cues,
    loops,
    pose: (change) => {
      engine.apply(change);
    },
    snap: () => debug.snapshot(engine.state),
    ticks: (frames) => engine.advance(frames),
    keyDown: (code) => key("keydown", code),
    keyUp: (code) => key("keyup", code),
    tap: async (code) => {
      key("keydown", code);
      await engine.advance(1);
      key("keyup", code);
    },
    pointer: (type, x, y, kind = "mouse") => {
      const down = type !== "pointerup";
      target.dispatchEvent(
        Object.assign(new Event(type), {
          clientX: x,
          clientY: y,
          pointerId: kind === "mouse" ? 1 : 7,
          pointerType: kind,
          isPrimary: true,
          button: type === "pointermove" ? -1 : 0,
          buttons: down && type !== "pointermove" ? 1 : 0,
        }),
      );
    },
  };
}
