// One frame: the mute toggle, the screen the frame's input drives, the fixed
// ticks the frame's delta buys, and the cues they raise.

import type { UpdateApi } from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { CUES, TICK_DT, type CueName } from "./constants";
import type { ShatterState } from "./game";
import { menuItems, runMenu } from "./screens";
import { stepPlaying, type Controls } from "./sim";
import { draft, startNewGame, type Draft } from "./world";

/** Below this the tick accumulator counts as holding a whole tick. */
const TICK_EPS = 1e-9;

export function updateGame(
  state: DeepReadonly<ShatterState>,
  api: UpdateApi,
  dt: number,
): ShatterState {
  const input = api.input;
  const s = draft(state);

  if (input.pressed("mute")) api.audio.setMuted(!api.audio.muted());
  s.muted = api.audio.muted();

  const wasPlaying = s.screen === "playing";
  runScreen(s, api);
  const live = wasPlaying && s.screen === "playing";

  if (live) {
    if (input.pressed("a")) s.firePending = true;
    if (input.pressed("b")) s.torpedoPending = true;
  }
  const controls: Controls = {
    turn: input.value("right") - input.value("left"),
    thrust: input.value("up") > 0,
    fire: input.value("a") > 0,
  };

  s.tickClock += Number.isFinite(dt) && dt > 0 ? dt : 0;
  while (s.tickClock + TICK_EPS >= TICK_DT) {
    s.tickClock = Math.max(0, s.tickClock - TICK_DT);
    s.simTime += TICK_DT;
    if (live && s.screen === "playing") {
      const cues = new Set<CueName>();
      stepPlaying(s, controls, cues);
      for (const cue of cues) api.audio.play(cue);
    }
  }

  if (s.screen !== "playing") s.ship.thrusting = false;
  if (s.ship.thrusting) api.audio.loop(CUES.thrust);
  else api.audio.stop(CUES.thrust);

  return s;
}

/** Reads the frame's screen input and moves between screens. */
function runScreen(s: Draft, api: UpdateApi): void {
  const input = api.input;
  switch (s.screen) {
    case "title":
      return menuScreen(s, api);
    case "howto":
      if (input.pressed("confirm") || input.pressed("back")) {
        s.screen = "title";
      }
      return;
    case "playing":
      if (input.pressed("pause")) {
        s.screen = "paused";
        s.menuIndex = 0;
        s.menuPresses = [];
      }
      return;
    case "paused": {
      const resume = input.pressed("pause");
      const leave = input.pressed("back");
      if (resume || leave) return enter(s, "playing");
      return menuScreen(s, api);
    }
    case "gameover":
      if (input.pressed("back")) return enter(s, "title");
      return menuScreen(s, api);
  }
}

function enter(s: Draft, screen: Draft["screen"]): void {
  s.screen = screen;
  s.menuIndex = 0;
  s.menuPresses = [];
  s.firePending = false;
  s.torpedoPending = false;
}

function menuScreen(s: Draft, api: UpdateApi): void {
  const input = api.input;
  if (menuItems(s.screen).length === 0) return;
  const outcome = runMenu(s, {
    up: input.pressed("up"),
    down: input.pressed("down"),
    confirm: input.pressed("confirm"),
    samples: input.pointerSamples(),
  });
  s.menuIndex = outcome.index;
  s.menuPresses = outcome.presses.map((p) => ({ ...p }));
  if (outcome.confirmed !== null) choose(s, outcome.confirmed);
}

/** Does what the confirmed entry on the current screen's menu does. */
function choose(s: Draft, index: number): void {
  const item = menuItems(s.screen)[index];
  switch (item) {
    case "PLAY":
    case "RESTART":
    case "PLAY AGAIN":
      startNewGame(s);
      return;
    case "HOW TO PLAY":
      s.screen = "howto";
      s.menuPresses = [];
      return;
    case "RESUME":
      return enter(s, "playing");
    case "QUIT TO MENU":
    case "MENU":
      return enter(s, "title");
  }
}
