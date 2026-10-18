import { describe, expect, it } from "vitest";
import { createHarness } from "./test-harness";

describe("rendering", () => {
  it("draws every screen without touching the state", async () => {
    const h = await createHarness();
    const d = h.debug;
    h.pose((s) => d.setScreen(s, "playing"));
    h.pose((s) => d.setWaveSpawning(s, false));
    h.pose((s) => d.setShipCollision(s, false));
    h.pose((s) => d.addRock(s, "large", 5, 5));
    h.pose((s) => d.addRock(s, "medium", 400, 600));
    const id = h.snap().rocks[0].id;
    h.pose((s) => d.setRockHealth(s, id, 1));
    h.pose((s) => d.addBullet(s, 1275, 300, 400, 0));
    h.pose((s) => d.addEnemyBullet(s, 300, 715, 0, 300));
    h.pose((s) => d.addTorpedo(s, 900, 600, 0));
    h.pose((s) => d.addSaucer(s, 1270, 100));
    h.pose((s) => d.setShipInvuln(s, 2));
    h.pose((s) => d.setWaveBanner(s, 1));
    h.pose((s) => d.setTorpedoCharge(s, 0.4));
    h.keyDown("ArrowUp");
    h.engine.startRecording();
    await h.ticks(20);
    for (const screen of ["paused", "gameover", "howto", "title"] as const) {
      h.pose((s) => d.setScreen(s, screen));
      await h.ticks(2);
    }
    const recording = h.engine.stopRecording();
    expect(recording.frames).toHaveLength(28);
    const methods = new Set(
      recording.ops.flatMap((op) => (op.op === "call" ? [op.method] : [])),
    );
    expect(methods).toContain("fillText");
    expect(methods).toContain("arc");
  });

  it("draws the extra-ship announcement and debris", async () => {
    const h = await createHarness();
    const d = h.debug;
    h.pose((s) => d.setScreen(s, "playing"));
    h.pose((s) => d.setWaveSpawning(s, false));
    h.pose((s) => d.setScore(s, 9_950));
    h.pose((s) => d.addRock(s, "small", 400, 200));
    h.pose((s) => d.addBullet(s, 400, 240, 0, -600));
    h.engine.startRecording();
    await h.ticks(12);
    const recording = h.engine.stopRecording();
    const texts = recording.ops.flatMap((op) =>
      op.op === "call" && op.method === "fillText" ? [op.args[0]] : [],
    );
    expect(texts).toContain("EXTRA SHIP");
    expect(h.engine.state.debris.length).toBeGreaterThan(0);
  });
});
