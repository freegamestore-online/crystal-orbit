import { useCallback, useRef, useState } from "react";

/** Returns [highScore, update]; update reports whether it set a new best. */
export function useHighScore(key: string): [number, (score: number) => boolean] {
  const [highScore, setHighScore] = useState<number>(() => {
    const stored = localStorage.getItem(key);
    return stored ? parseInt(stored, 10) || 0 : 0;
  });

  // Compare against a ref, not the render-time value: game loops often hold
  // on to the first `update` they saw, which would otherwise keep comparing
  // against the best from page load and let a worse score overwrite it.
  const bestRef = useRef(highScore);

  const update = useCallback(
    (score: number) => {
      if (score > bestRef.current) {
        bestRef.current = score;
        setHighScore(score);
        localStorage.setItem(key, String(score));
        return true;
      }
      return false;
    },
    [key],
  );

  return [highScore, update];
}
