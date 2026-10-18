// The values the engine's debug overlay shows, each a pure read of the state
// current at the read.

import type { InitApi } from "@clockwyrks/simple-2d";
import type { ShatterState } from "./game";

const fmt = (n: number): string => n.toFixed(1);

export function registerDiagnostics(api: InitApi<ShatterState>): void {
  const d = api.diagnostics;
  d.register("screen", (s) => s.screen);
  d.register("score", (s) => s.score);
  d.register("lives", (s) => s.lives);
  d.register("wave", (s) => s.wave);
  d.register("ship pos", (s) => `${fmt(s.ship.x)}, ${fmt(s.ship.y)}`);
  d.register("ship vel", (s) => `${fmt(s.ship.vx)}, ${fmt(s.ship.vy)}`);
  d.register("ship speed", (s) => fmt(Math.hypot(s.ship.vx, s.ship.vy)));
  d.register(
    "ship facing",
    (s) => `${fmt((s.ship.angle * 180) / Math.PI)} deg`,
  );
  d.register("ship grace", (s) => fmt(s.ship.invuln));
  d.register("bullets", (s) => s.bullets.length);
  d.register("rocks", (s) => s.rocks.length);
  d.register("saucer", (s) =>
    s.saucer === null ? "none" : `${fmt(s.saucer.x)}, ${fmt(s.saucer.y)}`,
  );
  d.register("torpedo charge", (s) => s.torpedoCharge.toFixed(2));
  d.register("torpedoes", (s) => s.torpedoes.length);
  d.register("sim time", (s) => fmt(s.simTime));
}
