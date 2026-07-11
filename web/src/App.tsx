import { useRef, useEffect, useState, useCallback } from "react";
import { Shell } from "./components/Shell";
import { GameEngine } from "./lib/game";
import { useHighScore } from "./hooks/useHighScore";
import * as BABYLON from "@babylonjs/core";
import type { GamePhase } from "./types";

// ── Heart SVG ────────────────────────────────────────────────────────────────
function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill={filled ? "#f87171" : "none"}
      stroke={filled ? "#f87171" : "#6b7280"}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  );
}

// ── HUD overlay ──────────────────────────────────────────────────────────────
function Hud({
  score,
  lives,
  highScore,
}: {
  score: number;
  lives: number;
  highScore: number;
}) {
  return (
    <div
      className="absolute top-0 left-0 right-0 flex items-center justify-between px-4 py-2 pointer-events-none"
      style={{ zIndex: 10 }}
    >
      {/* Score */}
      <div className="flex flex-col items-start">
        <span
          className="text-2xl font-bold leading-none"
          style={{ fontFamily: "Fraunces, serif", color: "#7dd3fc" }}
        >
          {score}
        </span>
        <span className="text-xs" style={{ color: "#64748b", fontFamily: "Manrope, sans-serif" }}>
          SCORE
        </span>
      </div>

      {/* Lives */}
      <div className="flex items-center gap-1">
        {[0, 1, 2].map((i) => (
          <Heart key={i} filled={i < lives} />
        ))}
      </div>

      {/* Best */}
      <div className="flex flex-col items-end">
        <span
          className="text-2xl font-bold leading-none"
          style={{ fontFamily: "Fraunces, serif", color: "#a78bfa" }}
        >
          {highScore}
        </span>
        <span className="text-xs" style={{ color: "#64748b", fontFamily: "Manrope, sans-serif" }}>
          BEST
        </span>
      </div>
    </div>
  );
}

// ── Start screen ─────────────────────────────────────────────────────────────
function StartScreen({ onStart }: { onStart: () => void }) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6"
      style={{ zIndex: 20, background: "rgba(4,6,20,0.82)", backdropFilter: "blur(6px)" }}
    >
      <div className="flex flex-col items-center gap-2">
        <span style={{ fontSize: "3.5rem" }}>💎</span>
        <h1
          className="text-4xl font-bold text-center"
          style={{ fontFamily: "Fraunces, serif", color: "#7dd3fc" }}
        >
          Crystal Orbit
        </h1>
        <p
          className="text-center max-w-xs text-sm leading-relaxed"
          style={{ color: "#94a3b8", fontFamily: "Manrope, sans-serif" }}
        >
          Collect glowing crystals. Dodge the red hazard orbs. Survive as long as you can!
        </p>
      </div>

      <div
        className="rounded-xl p-4 text-sm max-w-xs w-full"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(125,211,252,0.15)", fontFamily: "Manrope, sans-serif", color: "#94a3b8" }}
      >
        <div className="grid grid-cols-2 gap-y-2 gap-x-4">
          <span style={{ color: "#7dd3fc" }}>Move</span>
          <span>WASD / Arrow keys</span>
          <span style={{ color: "#7dd3fc" }}>Touch</span>
          <span>Drag on screen</span>
          <span style={{ color: "#7dd3fc" }}>Collect</span>
          <span>💎 +10 pts each</span>
          <span style={{ color: "#7dd3fc" }}>Avoid</span>
          <span>🔴 Red orbs</span>
          <span style={{ color: "#7dd3fc" }}>Lives</span>
          <span>3 — then game over</span>
        </div>
      </div>

      <button
        onClick={onStart}
        className="px-10 py-4 rounded-2xl text-lg font-bold transition-transform active:scale-95"
        style={{
          fontFamily: "Fraunces, serif",
          background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
          color: "#fff",
          boxShadow: "0 0 32px rgba(59,130,246,0.5)",
          minWidth: "180px",
          minHeight: "56px",
        }}
      >
        Play
      </button>
    </div>
  );
}

// ── Game-over screen ──────────────────────────────────────────────────────────
function GameOverScreen({
  score,
  highScore,
  onRestart,
}: {
  score: number;
  highScore: number;
  onRestart: () => void;
}) {
  const isNewBest = score > 0 && score >= highScore;
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-6"
      style={{ zIndex: 20, background: "rgba(4,6,20,0.88)", backdropFilter: "blur(6px)" }}
    >
      <div className="flex flex-col items-center gap-2">
        <span style={{ fontSize: "3rem" }}>💥</span>
        <h2
          className="text-4xl font-bold"
          style={{ fontFamily: "Fraunces, serif", color: "#f87171" }}
        >
          Game Over
        </h2>
        {isNewBest && (
          <span
            className="text-sm font-semibold px-3 py-1 rounded-full"
            style={{ background: "rgba(167,139,250,0.2)", color: "#a78bfa", fontFamily: "Manrope, sans-serif" }}
          >
            ✨ New Best!
          </span>
        )}
      </div>

      <div
        className="rounded-2xl p-6 flex flex-col items-center gap-4 w-56"
        style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(248,113,113,0.2)" }}
      >
        <div className="flex flex-col items-center">
          <span
            className="text-5xl font-bold"
            style={{ fontFamily: "Fraunces, serif", color: "#7dd3fc" }}
          >
            {score}
          </span>
          <span className="text-xs mt-1" style={{ color: "#64748b", fontFamily: "Manrope, sans-serif" }}>
            FINAL SCORE
          </span>
        </div>
        <div className="w-full h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
        <div className="flex flex-col items-center">
          <span
            className="text-3xl font-bold"
            style={{ fontFamily: "Fraunces, serif", color: "#a78bfa" }}
          >
            {highScore}
          </span>
          <span className="text-xs mt-1" style={{ color: "#64748b", fontFamily: "Manrope, sans-serif" }}>
            BEST
          </span>
        </div>
      </div>

      <button
        onClick={onRestart}
        className="px-10 py-4 rounded-2xl text-lg font-bold transition-transform active:scale-95"
        style={{
          fontFamily: "Fraunces, serif",
          background: "linear-gradient(135deg, #3b82f6 0%, #06b6d4 100%)",
          color: "#fff",
          boxShadow: "0 0 32px rgba(59,130,246,0.4)",
          minWidth: "180px",
          minHeight: "56px",
        }}
      >
        Play Again
      </button>
    </div>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<GameEngine | null>(null);

  const [phase, setPhase] = useState<GamePhase>("menu");
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [finalScore, setFinalScore] = useState(0);
  const [highScore, updateHighScore] = useHighScore("crystal_orbit_highscore");

  // Build the Babylon scene once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const babylonEngine = new BABYLON.Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
    });
    const scene = new BABYLON.Scene(babylonEngine);

    const gameEngine = new GameEngine(babylonEngine, scene, {
      onScoreChange: (s) => setScore(s),
      onLivesChange: (l) => setLives(l),
      onGameOver: (s) => {
        setFinalScore(s);
        updateHighScore(s);
        setPhase("over");
      },
    });

    engineRef.current = gameEngine;

    return () => {
      gameEngine.dispose();
      scene.dispose();
      babylonEngine.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStart = useCallback(() => {
    setScore(0);
    setLives(3);
    setPhase("playing");
    engineRef.current?.start();
  }, []);

  const handleRestart = useCallback(() => {
    setScore(0);
    setLives(3);
    setPhase("playing");
    engineRef.current?.start();
  }, []);

  return (
    <Shell>
      {/* Game container — fills the main area */}
      <div className="relative w-full h-full" style={{ overflow: "hidden" }}>
        {/* Babylon canvas */}
        <canvas
          ref={canvasRef}
          style={{ width: "100%", height: "100%", display: "block", touchAction: "none" }}
        />

        {/* HUD — always visible during play */}
        {phase === "playing" && (
          <Hud score={score} lives={lives} highScore={highScore} />
        )}

        {/* Start screen */}
        {phase === "menu" && <StartScreen onStart={handleStart} />}

        {/* Game-over screen */}
        {phase === "over" && (
          <GameOverScreen
            score={finalScore}
            highScore={highScore}
            onRestart={handleRestart}
          />
        )}
      </div>
    </Shell>
  );
}
