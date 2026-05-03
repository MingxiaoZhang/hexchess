// Visual effects: screen shake, particles, flash.
// This module is fully independent of game logic and networking.

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  alpha: number;
  life: number; // 0-1, decreases per frame
  decay: number;
}

interface ShakeState {
  amplitude: number;
  endTime: number;
}

interface FlashState {
  alpha: number; // current alpha, counts down
  color: string;
}

// Module-level state (single effect layer per game)
let shakeState: ShakeState | null = null;
let flashState: FlashState | null = null;
const particles: Particle[] = [];

export function triggerShake(amplitude: number, durationMs: number): void {
  shakeState = { amplitude, endTime: Date.now() + durationMs };
}

export function triggerFlash(color: string, alpha = 0.6): void {
  flashState = { alpha, color };
}

export function triggerParticles(cx: number, cy: number, count: number, color: string): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 2 + Math.random() * 5;
    particles.push({
      x: cx,
      y: cy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      radius: 2 + Math.random() * 4,
      color,
      alpha: 1,
      life: 1,
      decay: 0.02 + Math.random() * 0.03,
    });
  }
}

// Returns current {dx, dy} shake offset for this frame.
export function getShakeOffset(): { dx: number; dy: number } {
  if (!shakeState) return { dx: 0, dy: 0 };
  if (Date.now() >= shakeState.endTime) {
    shakeState = null;
    return { dx: 0, dy: 0 };
  }
  const { amplitude } = shakeState;
  return {
    dx: (Math.random() * 2 - 1) * amplitude,
    dy: (Math.random() * 2 - 1) * amplitude,
  };
}

// Draw and update all particles onto ctx.
export function drawAndUpdateParticles(ctx: CanvasRenderingContext2D): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.15; // gravity
    p.life -= p.decay;
    p.alpha = p.life;

    if (p.life <= 0) {
      particles.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = p.alpha;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Draw full-screen flash overlay. Returns true if flash is still active.
export function drawFlash(ctx: CanvasRenderingContext2D, width: number, height: number): boolean {
  if (!flashState || flashState.alpha <= 0) {
    flashState = null;
    return false;
  }
  ctx.save();
  ctx.globalAlpha = flashState.alpha;
  ctx.fillStyle = flashState.color;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();

  flashState.alpha -= 0.04; // fade out ~25 frames
  return true;
}

// Shake intensity config keyed by captured piece value
export const SHAKE_CONFIG: Record<string, { amplitude: number; duration: number }> = {
  pawn:   { amplitude: 0,  duration: 0 },
  knight: { amplitude: 3,  duration: 200 },
  bishop: { amplitude: 3,  duration: 200 },
  rook:   { amplitude: 6,  duration: 300 },
  queen:  { amplitude: 12, duration: 400 },
  king:   { amplitude: 20, duration: 600 },
  atomic: { amplitude: 15, duration: 500 },
  checkmate: { amplitude: 20, duration: 600 },
};
