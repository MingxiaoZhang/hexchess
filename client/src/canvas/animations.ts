// Piece movement animation — sliding from source to destination over ~150ms.

import { Position } from '@hexchess/shared';

const ANIMATION_DURATION_MS = 150;

export interface PieceAnimation {
  pieceId: string;
  from: Position;
  to: Position;
  startTime: number;
}

let current: PieceAnimation | null = null;

export function startAnimation(pieceId: string, from: Position, to: Position): void {
  current = { pieceId, from, to, startTime: performance.now() };
}

// Returns interpolated canvas {x,y} for the animating piece, or null if done.
export function getAnimationProgress(
  toCanvas: (pos: Position) => { x: number; y: number }
): { pieceId: string; x: number; y: number } | null {
  if (!current) return null;

  const elapsed = performance.now() - current.startTime;
  const t = Math.min(elapsed / ANIMATION_DURATION_MS, 1);
  const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

  if (t >= 1) {
    current = null;
    return null;
  }

  const src = toCanvas(current.from);
  const dst = toCanvas(current.to);

  return {
    pieceId: current.pieceId,
    x: src.x + (dst.x - src.x) * ease,
    y: src.y + (dst.y - src.y) * ease,
  };
}

export function isAnimating(): boolean {
  return current !== null;
}

export function clearAnimation(): void {
  current = null;
}
