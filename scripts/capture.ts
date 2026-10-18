// The showcase capture harness: the game exactly as `src/main.ts` stands it
// up, with the engine handed to the page so a capture script can read the
// state, arm the recorder, and save what it recorded. Development use only;
// it is not part of the build.

import { createEngine } from "@clockwyrks/simple-2d";
import { FIELD_H, FIELD_W, LAYOUT } from "../src/constants";
import { BACKGROUND, game } from "../src/game";

const canvas = document.getElementById("stage") as HTMLCanvasElement;
const engine = createEngine({
  canvas,
  width: FIELD_W,
  height: FIELD_H,
  game,
  background: BACKGROUND,
  layout: LAYOUT,
});

await engine.initialize();
(window as unknown as { shatter: typeof engine }).shatter = engine;
void engine.run();
