"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

const COLORS = ["var(--accent)", "var(--accent-2)", "var(--warn)", "var(--danger)"];
const PIECES = 26;

type Piece = { id: number; x: number; y: number; rotate: number; delay: number; color: string; isCircle: boolean };

function generatePieces(): Piece[] {
  return Array.from({ length: PIECES }, (_, i) => ({
    id: i,
    x: (Math.random() - 0.5) * 320,
    y: 140 + Math.random() * 60,
    rotate: Math.random() * 360,
    delay: Math.random() * 0.15,
    color: COLORS[i % COLORS.length],
    isCircle: i % 2 === 0,
  }));
}

/** A small one-shot confetti burst for the "interview complete" moment.
 * Pure CSS/framer-motion, no external library. Skipped entirely under
 * reduced motion — it's celebratory flourish, not information. */
export function Confetti() {
  const reduceMotion = useReducedMotion();
  // Lazy initializer: the randomness is intentionally computed exactly once
  // per mount, not on every render — the React-blessed escape hatch for
  // one-time impure setup (see useState docs on lazy initial state).
  const [pieces] = useState<Piece[]>(() => (reduceMotion ? [] : generatePieces()));

  if (reduceMotion) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 h-0 overflow-visible" aria-hidden>
      {pieces.map((p) => (
        <motion.span
          key={p.id}
          className="absolute left-1/2 top-0"
          style={{
            width: p.isCircle ? 6 : 8,
            height: p.isCircle ? 6 : 4,
            borderRadius: p.isCircle ? "50%" : 1,
            background: p.color,
          }}
          initial={{ x: 0, y: 0, opacity: 1, rotate: 0 }}
          animate={{ x: p.x, y: p.y, opacity: 0, rotate: p.rotate }}
          transition={{ duration: 1.1, delay: p.delay, ease: "easeOut" }}
        />
      ))}
    </div>
  );
}
