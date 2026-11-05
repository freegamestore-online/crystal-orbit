import * as BABYLON from "@babylonjs/core";
import { afterEach, describe, expect, it } from "vitest";
import { GameEngine, HAZARD_SAFE_SPAWN_DIST, safeOrbitAngle } from "./game";

// Drives the engine headlessly: NullEngine has no canvas, so hand it a jsdom
// one to get the input listeners bound.
function setup() {
  const engine = new BABYLON.NullEngine();
  const canvas = document.createElement("canvas");
  engine.getRenderingCanvas = () => canvas;
  const scene = new BABYLON.Scene(engine);
  const game = new GameEngine(engine, scene, { onScoreChange() {}, onLivesChange() {}, onGameOver() {} });
  const update = (dt: number) => (game as unknown as { update(dt: number): void }).update(dt);
  const player = () => scene.getMeshByName("player")!.position;
  const dispose = () => {
    game.dispose();
    scene.dispose();
    engine.dispose();
  };
  return { game, scene, canvas, update, player, dispose };
}

let cleanup: (() => void) | null = null;
afterEach(() => {
  cleanup?.();
  cleanup = null;
});

describe("GameEngine", () => {
  it("stops moving when the window loses focus mid key-press", () => {
    const t = setup();
    cleanup = t.dispose;
    t.game.start();
    window.dispatchEvent(new KeyboardEvent("keydown", { code: "ArrowUp" }));
    t.update(0.1);
    const moved = t.player().clone();
    expect(moved.length()).toBeGreaterThan(0.1);
    window.dispatchEvent(new Event("blur"));
    t.update(0.1);
    expect(t.player().equalsWithEpsilon(moved, 1e-6)).toBe(true);
  });

  it("counts every pointermove between two frames", () => {
    const t = setup();
    cleanup = t.dispose;
    t.game.start();
    const ptr = (type: string, x: number) => t.canvas.dispatchEvent(new MouseEvent(type, { clientX: x, clientY: 0 }));
    ptr("pointerdown", 0);
    ptr("pointermove", 10);
    ptr("pointermove", 20); // two moves before the next frame
    t.update(0.1);
    const twoMoves = t.player().length();

    t.game.start();
    ptr("pointerdown", 0);
    ptr("pointermove", 20); // same distance in one move
    t.update(0.1);
    expect(twoMoves).toBeCloseTo(t.player().length(), 6);
  });

  it("disposes crystal and hazard materials, not just meshes", () => {
    const t = setup();
    cleanup = t.dispose;
    const before = t.scene.materials.length;
    t.game.start(); // spawns the initial hazards
    t.update(2.3); // spawns one crystal
    expect(t.scene.materials.length).toBeGreaterThan(before);
    t.game.start(); // clears crystals and hazards, spawns 3 new hazards
    t.game.start();
    expect(t.scene.materials.length).toBe(before + 3);
  });
});

describe("safeOrbitAngle", () => {
  it("never spawns a hazard within the safe distance of the player", () => {
    const player = { x: 5, z: 0 };
    let i = 0;
    const seq = [0, 0.01, 0.99, 0.5]; // first three land right next to the player
    const a = safeOrbitAngle(5, player, () => seq[i++]!);
    expect(Math.hypot(Math.cos(a) * 5 - player.x, Math.sin(a) * 5 - player.z)).toBeGreaterThanOrEqual(HAZARD_SAFE_SPAWN_DIST);
    expect(i).toBe(4);
  });

  it("falls back to the far side of the orbit", () => {
    const a = safeOrbitAngle(5, { x: 5, z: 0 }, () => 0);
    expect(Math.cos(a) * 5).toBeCloseTo(-5);
  });
});
