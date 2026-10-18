// The six cues, synthesized: each a distinct short sound so the events are
// told apart by ear. `thrust` is the held one, looped while thrust is applied.

import type { CueSpec, InitApi } from "@clockwyrks/simple-2d";
import { CUES, type CueName } from "./constants";

export const CUE_SPECS: Readonly<Record<CueName, CueSpec>> = {
  [CUES.fire]: {
    wave: "square",
    freq: 980,
    freqTo: 420,
    gain: 0.08,
    durationMs: 70,
  },
  [CUES.shatter]: {
    wave: "sawtooth",
    freq: 220,
    freqTo: 45,
    gain: 0.22,
    durationMs: 260,
  },
  [CUES.thrust]: { wave: "sawtooth", freq: 58, gain: 0.06, durationMs: 120 },
  [CUES.saucer]: {
    wave: "triangle",
    freq: 520,
    freqTo: 860,
    gain: 0.16,
    durationMs: 420,
  },
  [CUES.death]: {
    wave: "sawtooth",
    freq: 420,
    freqTo: 30,
    gain: 0.28,
    durationMs: 800,
  },
  [CUES.extraLife]: {
    wave: "square",
    freq: 660,
    freqTo: 1320,
    gain: 0.14,
    durationMs: 380,
  },
};

export function defineCues<S>(api: InitApi<S>): void {
  for (const name of Object.values(CUES))
    api.audio.define(name, CUE_SPECS[name]);
}
