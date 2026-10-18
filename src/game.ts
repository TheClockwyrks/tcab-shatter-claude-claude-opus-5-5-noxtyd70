// Shatter — the game: the state it is written against, the debug surface that
// poses and reads that state, and the three functions the engine drives.
//
// The simulation lives in `sim.ts`, the screens and menus in `screens.ts`, the
// drawing in `render.ts`, and the debug surface in `debug.ts`. This module is
// the seam the engine binds to.

import type {
  Game,
  InitApi,
  UpdateApi,
  RenderApi,
} from "@clockwyrks/simple-2d";
import type { DeepReadonly } from "ts-essentials";
import { ACTIONS, BINDINGS, type RockSize } from "./constants";
import { defineCues } from "./audio";
import { createDebugApi, type ShatterDebugApi } from "./debug";
import { registerDiagnostics } from "./diagnostics";
import { renderGame } from "./render";
import { updateGame } from "./update";
import { initialState } from "./world";

export type { ShatterDebugApi } from "./debug";

export type Screen = "title" | "howto" | "playing" | "paused" | "gameover";
export type SaucerEdge = "left" | "right";
export type FieldEdge = "top" | "bottom" | "left" | "right";

export interface ShipState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly angle: number;
  readonly thrusting: boolean;
  readonly invuln: number;
  readonly collision: boolean;
  readonly fireCooldown: number;
}

export interface BulletState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
}

export interface RockState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly size: RockSize;
  readonly spin: number;
  readonly health: number;
  readonly flash: number;
}

export interface SaucerState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly mind: boolean;
  readonly gun: boolean;
  readonly travel: boolean;
  readonly weave: 1 | -1;
  readonly fireClock: number;
  readonly weaveClock: number;
  readonly age: number;
}

export interface TorpedoState {
  readonly id: number;
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly heading: number;
  readonly life: number;
  readonly homing: boolean;
}

/** A piece of cosmetic debris thrown off by a destruction. Drawn, never collided. */
export interface DebrisState {
  readonly x: number;
  readonly y: number;
  readonly vx: number;
  readonly vy: number;
  readonly life: number;
  readonly maxLife: number;
  readonly hue: number;
}

/** A pointer press or touch landing on a menu entry, awaiting its release. */
export interface MenuPress {
  readonly id: number;
  readonly index: number;
}

export interface ShatterState {
  readonly screen: Screen;
  readonly menuIndex: number;

  readonly score: number;
  readonly lives: number;
  readonly wave: number;
  readonly waveBanner: number;

  readonly ship: ShipState;
  readonly bullets: readonly BulletState[];
  readonly rocks: readonly RockState[];
  readonly saucer: SaucerState | null;
  readonly enemyBullets: readonly BulletState[];
  readonly torpedoes: readonly TorpedoState[];
  readonly torpedoCharge: number;

  readonly waveSpawning: boolean;
  readonly saucerSpawning: boolean;
  readonly saucerClock: number;
  readonly saucerDue: number;

  readonly nextSaucerEdge: SaucerEdge | null;
  readonly nextSaucerRow: number | null;
  readonly nextSaucerAim: number | null;
  readonly nextRockSpeed: number | null;
  readonly nextRecycleEdge: FieldEdge | null;

  readonly tickClock: number;
  readonly nextId: number;
  readonly simTime: number;
  readonly muted: boolean;

  // ---- Build-owned fields, beside the declared ones ----------------------

  /** The random generator's 32-bit state; every draw advances it. */
  readonly rng: number;
  /** A fire press that has not yet met a tick to be taken on. */
  readonly firePending: boolean;
  /** A torpedo press that has not yet met a tick to be taken on. */
  readonly torpedoPending: boolean;
  /** Pointer presses and touch landings on a menu entry, by pointer id. */
  readonly menuPresses: readonly MenuPress[];
  /** Seconds left on the on-field extra-ship announcement, 0 for none. */
  readonly extraShipBanner: number;
  /** Cosmetic debris from destroyed rocks, saucers, and ships. */
  readonly debris: readonly DebrisState[];
}

/** The field background: a deep blue-black. */
export const BACKGROUND = "#04050d";

/** The game this build's engine drives. */
export const game: Game<ShatterState, ShatterDebugApi> = {
  initialize(api: InitApi<ShatterState>): [ShatterState, ShatterDebugApi] {
    for (const name of ACTIONS) api.input.register(name, BINDINGS[name]);
    defineCues(api);
    registerDiagnostics(api);
    const seed = Math.floor(Math.random() * 0x100000000) >>> 0;
    return [initialState(seed), createDebugApi()];
  },

  update(
    state: DeepReadonly<ShatterState>,
    api: UpdateApi,
    dt: number,
  ): ShatterState {
    return updateGame(state, api, dt);
  },

  render(state: DeepReadonly<ShatterState>, api: RenderApi): void {
    renderGame(state, api.ctx);
  },
};
