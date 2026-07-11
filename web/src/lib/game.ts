import * as BABYLON from "@babylonjs/core";

// ── Constants ────────────────────────────────────────────────────────────────
export const ARENA_RADIUS = 9;
const PLAYER_RADIUS = 0.45;
const CRYSTAL_RADIUS = 0.35;
const HAZARD_RADIUS = 0.5;
const PLAYER_SPEED_BASE = 5.5;
const CRYSTAL_SPAWN_INTERVAL = 2.2; // seconds
const MAX_CRYSTALS = 8;
const HAZARD_BASE_SPEED = 0.9; // rad/s
const HAZARD_SPEED_INCREMENT = 0.18;
const HAZARD_SPAWN_INTERVAL = 12; // seconds
const MAX_HAZARDS = 10;
const INITIAL_HAZARDS = 3;

// ── Types ────────────────────────────────────────────────────────────────────
export interface GameCallbacks {
  onScoreChange: (score: number) => void;
  onLivesChange: (lives: number) => void;
  onGameOver: (finalScore: number) => void;
}

interface Crystal {
  mesh: BABYLON.Mesh;
  light: BABYLON.PointLight;
  angle: number;
  dist: number;
  bobOffset: number;
}

interface Hazard {
  mesh: BABYLON.Mesh;
  light: BABYLON.PointLight;
  orbitRadius: number;
  orbitAngle: number;
  orbitSpeed: number;
  orbitY: number;
  bobOffset: number;
}

// ── GameEngine ───────────────────────────────────────────────────────────────
export class GameEngine {
  private scene: BABYLON.Scene;
  private engine: BABYLON.Engine;
  private callbacks: GameCallbacks;

  // player
  private playerMesh!: BABYLON.Mesh;
  private playerLight!: BABYLON.PointLight;
  private playerPos = new BABYLON.Vector3(0, PLAYER_RADIUS, 0);
  private playerVel = new BABYLON.Vector3(0, 0, 0);
  private invincibleTimer = 0;

  // game state
  private score = 0;
  private lives = 3;
  private running = false;
  private elapsed = 0;
  private crystalTimer = 0;
  private hazardTimer = 0;

  // collections
  private crystals: Crystal[] = [];
  private hazards: Hazard[] = [];

  // arena
  private arenaMesh!: BABYLON.Mesh;
  private arenaRing!: BABYLON.Mesh;

  // input
  private keys: Record<string, boolean> = {};
  private dragActive = false;
  private dragLast = new BABYLON.Vector2(0, 0);
  private dragDelta = new BABYLON.Vector2(0, 0);

  // camera
  private camera!: BABYLON.ArcRotateCamera;

  constructor(engine: BABYLON.Engine, scene: BABYLON.Scene, callbacks: GameCallbacks) {
    this.engine = engine;
    this.scene = scene;
    this.callbacks = callbacks;
    this.buildScene();
    this.bindInput();
    this.startRenderLoop();
  }

  // ── Scene setup ─────────────────────────────────────────────────────────
  private buildScene() {
    const scene = this.scene;
    scene.clearColor = new BABYLON.Color4(0.04, 0.06, 0.14, 1);

    // Camera
    this.camera = new BABYLON.ArcRotateCamera(
      "cam", -Math.PI / 2, Math.PI / 3.2, 18, BABYLON.Vector3.Zero(), scene
    );
    this.camera.lowerRadiusLimit = 14;
    this.camera.upperRadiusLimit = 24;
    this.camera.lowerBetaLimit = 0.3;
    this.camera.upperBetaLimit = Math.PI / 2.4;

    // Lights
    const ambient = new BABYLON.HemisphericLight("amb", new BABYLON.Vector3(0, 1, 0), scene);
    ambient.intensity = 0.35;
    ambient.diffuse = new BABYLON.Color3(0.6, 0.7, 1.0);
    ambient.groundColor = new BABYLON.Color3(0.1, 0.1, 0.2);

    // Arena floor
    const arenaMat = new BABYLON.StandardMaterial("arenaMat", scene);
    arenaMat.diffuseColor = new BABYLON.Color3(0.08, 0.12, 0.22);
    arenaMat.specularColor = new BABYLON.Color3(0.4, 0.5, 0.8);
    arenaMat.specularPower = 32;
    arenaMat.emissiveColor = new BABYLON.Color3(0.02, 0.04, 0.1);

    this.arenaMesh = BABYLON.MeshBuilder.CreateDisc(
      "arena", { radius: ARENA_RADIUS, tessellation: 64 }, scene
    );
    this.arenaMesh.rotation.x = Math.PI / 2;
    this.arenaMesh.material = arenaMat;

    // Arena grid lines (torus rings)
    for (let r = 2; r <= ARENA_RADIUS - 0.5; r += 2.5) {
      const ring = BABYLON.MeshBuilder.CreateTorus(
        `ring${r}`, { diameter: r * 2, thickness: 0.04, tessellation: 64 }, scene
      );
      const ringMat = new BABYLON.StandardMaterial(`ringMat${r}`, scene);
      ringMat.emissiveColor = new BABYLON.Color3(0.1, 0.2, 0.5);
      ring.material = ringMat;
    }

    // Arena boundary ring
    this.arenaRing = BABYLON.MeshBuilder.CreateTorus(
      "boundary", { diameter: ARENA_RADIUS * 2, thickness: 0.15, tessellation: 80 }, scene
    );
    const ringMat = new BABYLON.StandardMaterial("boundaryMat", scene);
    ringMat.emissiveColor = new BABYLON.Color3(0.2, 0.5, 1.0);
    ringMat.diffuseColor = new BABYLON.Color3(0.1, 0.3, 0.8);
    this.arenaRing.material = ringMat;

    // Stars (simple point sprites as small spheres far away)
    for (let i = 0; i < 80; i++) {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.random() * Math.PI;
      const r = 40 + Math.random() * 20;
      const star = BABYLON.MeshBuilder.CreateSphere(`star${i}`, { diameter: 0.18 }, scene);
      star.position.set(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.cos(phi),
        r * Math.sin(phi) * Math.sin(theta)
      );
      const starMat = new BABYLON.StandardMaterial(`starMat${i}`, scene);
      starMat.emissiveColor = new BABYLON.Color3(
        0.7 + Math.random() * 0.3,
        0.7 + Math.random() * 0.3,
        0.8 + Math.random() * 0.2
      );
      starMat.disableLighting = true;
      star.material = starMat;
    }

    // Player
    this.playerMesh = BABYLON.MeshBuilder.CreateSphere(
      "player", { diameter: PLAYER_RADIUS * 2, segments: 16 }, scene
    );
    this.playerMesh.position.copyFrom(this.playerPos);
    const playerMat = new BABYLON.StandardMaterial("playerMat", scene);
    playerMat.diffuseColor = new BABYLON.Color3(0.3, 0.8, 1.0);
    playerMat.emissiveColor = new BABYLON.Color3(0.1, 0.4, 0.6);
    playerMat.specularColor = new BABYLON.Color3(1, 1, 1);
    playerMat.specularPower = 16;
    this.playerMesh.material = playerMat;

    this.playerLight = new BABYLON.PointLight("playerLight", this.playerPos.clone(), scene);
    this.playerLight.diffuse = new BABYLON.Color3(0.3, 0.8, 1.0);
    this.playerLight.intensity = 1.8;
    this.playerLight.range = 6;
  }

  // ── Input ────────────────────────────────────────────────────────────────
  private bindInput() {
    const canvas = this.engine.getRenderingCanvas();
    if (!canvas) return;

    window.addEventListener("keydown", (e) => { this.keys[e.code] = true; });
    window.addEventListener("keyup", (e) => { this.keys[e.code] = false; });

    // Touch/mouse drag
    canvas.addEventListener("pointerdown", (e) => {
      this.dragActive = true;
      this.dragLast.set(e.clientX, e.clientY);
      this.dragDelta.set(0, 0);
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!this.dragActive) return;
      this.dragDelta.set(e.clientX - this.dragLast.x, e.clientY - this.dragLast.y);
      this.dragLast.set(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerup", () => {
      this.dragActive = false;
      this.dragDelta.set(0, 0);
    });
    canvas.addEventListener("pointercancel", () => {
      this.dragActive = false;
      this.dragDelta.set(0, 0);
    });
  }

  // ── Crystal spawning ─────────────────────────────────────────────────────
  private spawnCrystal() {
    if (this.crystals.length >= MAX_CRYSTALS) return;
    const scene = this.scene;

    const angle = Math.random() * Math.PI * 2;
    const dist = 1.5 + Math.random() * (ARENA_RADIUS - 2.5);

    const mesh = BABYLON.MeshBuilder.CreatePolyhedron(
      `crystal${Date.now()}`, { type: 1, size: CRYSTAL_RADIUS }, scene
    );
    mesh.position.set(
      Math.cos(angle) * dist,
      CRYSTAL_RADIUS + 0.3,
      Math.sin(angle) * dist
    );
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, 0);

    const hue = Math.random();
    const color = hsvToColor3(hue, 0.8, 1.0);
    const mat = new BABYLON.StandardMaterial(`crystalMat${Date.now()}`, scene);
    mat.diffuseColor = color;
    mat.emissiveColor = color.scale(0.5);
    mat.specularColor = new BABYLON.Color3(1, 1, 1);
    mat.specularPower = 8;
    mesh.material = mat;

    const light = new BABYLON.PointLight(`crystalLight${Date.now()}`, mesh.position.clone(), scene);
    light.diffuse = color;
    light.intensity = 1.2;
    light.range = 4;

    this.crystals.push({ mesh, light, angle, dist, bobOffset: Math.random() * Math.PI * 2 });
  }

  // ── Hazard spawning ──────────────────────────────────────────────────────
  private spawnHazard() {
    if (this.hazards.length >= MAX_HAZARDS) return;
    const scene = this.scene;
    const level = Math.floor(this.elapsed / HAZARD_SPAWN_INTERVAL);
    const speed = HAZARD_BASE_SPEED + level * HAZARD_SPEED_INCREMENT;
    const dir = Math.random() < 0.5 ? 1 : -1;

    const orbitRadius = 2.5 + Math.random() * (ARENA_RADIUS - 3.5);
    const orbitAngle = Math.random() * Math.PI * 2;
    const orbitY = 0.5 + Math.random() * 0.8;

    const mesh = BABYLON.MeshBuilder.CreateSphere(
      `hazard${Date.now()}`, { diameter: HAZARD_RADIUS * 2, segments: 12 }, scene
    );
    mesh.position.set(
      Math.cos(orbitAngle) * orbitRadius, orbitY, Math.sin(orbitAngle) * orbitRadius
    );

    const mat = new BABYLON.StandardMaterial(`hazardMat${Date.now()}`, scene);
    mat.diffuseColor = new BABYLON.Color3(1.0, 0.15, 0.1);
    mat.emissiveColor = new BABYLON.Color3(0.6, 0.05, 0.02);
    mat.specularColor = new BABYLON.Color3(1, 0.5, 0.5);
    mat.specularPower = 12;
    mesh.material = mat;

    const light = new BABYLON.PointLight(`hazardLight${Date.now()}`, mesh.position.clone(), scene);
    light.diffuse = new BABYLON.Color3(1.0, 0.2, 0.1);
    light.intensity = 1.5;
    light.range = 5;

    this.hazards.push({
      mesh, light, orbitRadius, orbitAngle,
      orbitSpeed: speed * dir,
      orbitY,
      bobOffset: Math.random() * Math.PI * 2,
    });
  }

  // ── Remove crystal ───────────────────────────────────────────────────────
  private removeCrystal(idx: number) {
    const c = this.crystals[idx];
    if (!c) return;
    c.mesh.dispose();
    c.light.dispose();
    this.crystals.splice(idx, 1);
  }

  // ── Remove hazard ────────────────────────────────────────────────────────
  private removeAllHazards() {
    for (const h of this.hazards) {
      h.mesh.dispose();
      h.light.dispose();
    }
    this.hazards = [];
  }

  private removeAllCrystals() {
    for (const c of this.crystals) {
      c.mesh.dispose();
      c.light.dispose();
    }
    this.crystals = [];
  }

  // ── Game start / stop ────────────────────────────────────────────────────
  start() {
    this.score = 0;
    this.lives = 3;
    this.elapsed = 0;
    this.crystalTimer = 0;
    this.hazardTimer = 0;
    this.invincibleTimer = 0;
    this.playerPos.set(0, PLAYER_RADIUS, 0);
    this.playerVel.set(0, 0, 0);
    this.playerMesh.position.copyFrom(this.playerPos);
    this.playerMesh.setEnabled(true);

    this.removeAllCrystals();
    this.removeAllHazards();

    // Spawn initial hazards
    for (let i = 0; i < INITIAL_HAZARDS; i++) this.spawnHazard();

    this.callbacks.onScoreChange(0);
    this.callbacks.onLivesChange(3);
    this.running = true;
  }

  stop() {
    this.running = false;
  }

  // ── Main update ──────────────────────────────────────────────────────────
  private update(dt: number) {
    if (!this.running) return;
    this.elapsed += dt;
    this.invincibleTimer = Math.max(0, this.invincibleTimer - dt);

    // ── Player movement ──────────────────────────────────────────────────
    const speed = PLAYER_SPEED_BASE;

    // Camera-relative movement
    const camYaw = this.camera.alpha + Math.PI / 2;
    const fwd = new BABYLON.Vector3(Math.cos(camYaw), 0, Math.sin(camYaw));
    const right = new BABYLON.Vector3(-Math.sin(camYaw), 0, Math.cos(camYaw));

    let moveX = 0, moveZ = 0;

    if (this.keys["ArrowUp"] || this.keys["KeyW"]) { moveX += fwd.x; moveZ += fwd.z; }
    if (this.keys["ArrowDown"] || this.keys["KeyS"]) { moveX -= fwd.x; moveZ -= fwd.z; }
    if (this.keys["ArrowLeft"] || this.keys["KeyA"]) { moveX -= right.x; moveZ -= right.z; }
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) { moveX += right.x; moveZ += right.z; }

    // Drag input (touch/mouse)
    if (this.dragActive) {
      const dragScale = 0.018;
      moveX += this.dragDelta.x * dragScale * right.x - this.dragDelta.y * dragScale * fwd.x;
      moveZ += this.dragDelta.x * dragScale * right.z - this.dragDelta.y * dragScale * fwd.z;
      this.dragDelta.set(0, 0);
    }

    // Normalize
    const len = Math.sqrt(moveX * moveX + moveZ * moveZ);
    if (len > 1) { moveX /= len; moveZ /= len; }

    this.playerPos.x += moveX * speed * dt;
    this.playerPos.z += moveZ * speed * dt;

    // Clamp to arena
    const flatDist = Math.sqrt(this.playerPos.x ** 2 + this.playerPos.z ** 2);
    const maxDist = ARENA_RADIUS - PLAYER_RADIUS - 0.1;
    if (flatDist > maxDist) {
      this.playerPos.x = (this.playerPos.x / flatDist) * maxDist;
      this.playerPos.z = (this.playerPos.z / flatDist) * maxDist;
    }

    this.playerMesh.position.copyFrom(this.playerPos);
    this.playerLight.position.copyFrom(this.playerPos);

    // Flicker when invincible
    if (this.invincibleTimer > 0) {
      this.playerMesh.setEnabled(Math.sin(this.elapsed * 20) > 0);
    } else {
      this.playerMesh.setEnabled(true);
    }

    // ── Crystal timers & animation ───────────────────────────────────────
    this.crystalTimer += dt;
    if (this.crystalTimer >= CRYSTAL_SPAWN_INTERVAL) {
      this.crystalTimer = 0;
      this.spawnCrystal();
    }

    for (const c of this.crystals) {
      c.mesh.rotation.y += dt * 1.5;
      c.mesh.rotation.x += dt * 0.8;
      const bob = Math.sin(this.elapsed * 2.5 + c.bobOffset) * 0.18;
      c.mesh.position.y = CRYSTAL_RADIUS + 0.3 + bob;
      c.light.position.copyFrom(c.mesh.position);
    }

    // ── Hazard timers & movement ─────────────────────────────────────────
    this.hazardTimer += dt;
    const level = Math.floor(this.elapsed / HAZARD_SPAWN_INTERVAL);
    const targetHazards = Math.min(INITIAL_HAZARDS + level, MAX_HAZARDS);
    if (this.hazards.length < targetHazards && this.hazardTimer >= HAZARD_SPAWN_INTERVAL) {
      this.hazardTimer = 0;
      this.spawnHazard();
    }

    for (const h of this.hazards) {
      h.orbitAngle += h.orbitSpeed * dt;
      const bob = Math.sin(this.elapsed * 1.8 + h.bobOffset) * 0.15;
      h.mesh.position.set(
        Math.cos(h.orbitAngle) * h.orbitRadius,
        h.orbitY + bob,
        Math.sin(h.orbitAngle) * h.orbitRadius
      );
      h.light.position.copyFrom(h.mesh.position);
    }

    // ── Collision: player vs crystals ────────────────────────────────────
    for (let i = this.crystals.length - 1; i >= 0; i--) {
      const c = this.crystals[i];
      if (!c) continue;
      const dx = this.playerPos.x - c.mesh.position.x;
      const dy = this.playerPos.y - c.mesh.position.y;
      const dz = this.playerPos.z - c.mesh.position.z;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < PLAYER_RADIUS + CRYSTAL_RADIUS + 0.1) {
        this.removeCrystal(i);
        this.score += 10;
        this.callbacks.onScoreChange(this.score);
      }
    }

    // ── Collision: player vs hazards ─────────────────────────────────────
    if (this.invincibleTimer <= 0) {
      for (const h of this.hazards) {
        const dx = this.playerPos.x - h.mesh.position.x;
        const dy = this.playerPos.y - h.mesh.position.y;
        const dz = this.playerPos.z - h.mesh.position.z;
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (dist < PLAYER_RADIUS + HAZARD_RADIUS + 0.05) {
          this.lives -= 1;
          this.invincibleTimer = 2.0;
          this.callbacks.onLivesChange(this.lives);
          if (this.lives <= 0) {
            this.running = false;
            this.callbacks.onGameOver(this.score);
            return;
          }
          break;
        }
      }
    }
  }

  // ── Render loop ──────────────────────────────────────────────────────────
  private startRenderLoop() {
    const scene = this.scene;
    let lastTime = performance.now();

    scene.onBeforeRenderObservable.add(() => {
      const now = performance.now();
      const dt = Math.min((now - lastTime) / 1000, 0.05);
      lastTime = now;
      this.update(dt);

      // Pulse arena ring
      const ringMat = this.arenaRing.material as BABYLON.StandardMaterial;
      const pulse = 0.15 + 0.1 * Math.sin(performance.now() / 600);
      ringMat.emissiveColor = new BABYLON.Color3(pulse, pulse * 2.5, pulse * 5);
    });

    this.engine.runRenderLoop(() => scene.render());
    window.addEventListener("resize", () => this.engine.resize());
  }

  dispose() {
    this.running = false;
    this.removeAllCrystals();
    this.removeAllHazards();
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
function hsvToColor3(h: number, s: number, v: number): BABYLON.Color3 {
  const i = Math.floor(h * 6);
  const f = h * 6 - i;
  const p = v * (1 - s);
  const q = v * (1 - f * s);
  const t = v * (1 - (1 - f) * s);
  switch (i % 6) {
    case 0: return new BABYLON.Color3(v, t, p);
    case 1: return new BABYLON.Color3(q, v, p);
    case 2: return new BABYLON.Color3(p, v, t);
    case 3: return new BABYLON.Color3(p, q, v);
    case 4: return new BABYLON.Color3(t, p, v);
    default: return new BABYLON.Color3(v, p, q);
  }
}
