# Hexchess — Visual Effects

All effects implemented in `client/src/canvas/effects.ts` and `client/src/canvas/animations.ts`. Effects are triggered by the `onMoveResult` callback in `GameScreen.tsx` — game logic and networking never call effects directly.

## Screen Shake

Applied as a CSS `translate()` transform on the canvas wrapper div, updated every animation frame. Random offset within amplitude bounds, applied while the shake timer is active.

**Trigger:** `triggerShake(amplitude, durationMs)`

| Event | Amplitude | Duration |
|---|---|---|
| Pawn captured | 0px | 0ms (no shake) |
| Knight/Bishop captured | 3px | 200ms |
| Rook captured | 6px | 300ms |
| Queen captured | 12px | 400ms |
| Atomic capture | 15px | 500ms |
| Checkmate | 20px | 600ms |
| King captured | 20px | 600ms |

## Particles

Pixel circles emitted from a center point with random velocities and gravity. Each particle has a life value (1→0) and fades as it decays.

**Trigger:** `triggerParticles(cx, cy, count, color)`

| Event | Count | Color |
|---|---|---|
| Atomic explosion | 30 | `#ff4400` (red-orange) |

## Screen Flash

Full-screen color overlay that fades out over ~25 frames (~400ms at 60fps).

**Trigger:** `triggerFlash(color, alpha)`

| Event | Color | Alpha |
|---|---|---|
| Checkmate | `rgba(255,255,255,1)` | 0.5 |

## Piece Movement Animation

Smooth slide from source to destination square over 150ms using ease-out cubic interpolation. Implemented in `animations.ts` — the renderer checks `getAnimationProgress()` each frame and draws the piece at the interpolated position.

**Not applied to:** Atomic captures (attacker and captured piece both disappear).

## Idle Glow

Soft filled circle behind each piece, pulsing sinusoidally at ~0.3 Hz. Color differs by side:
- White pieces: `rgba(200, 220, 255, 0.25)` (cool blue-white)
- Black pieces: `rgba(255, 180, 50, 0.25)` (warm amber)

## Atomic Upgrade Aura

Stronger pulsing red circle overlay on pieces carrying the Atomic upgrade:
- Color: `rgba(255, 60, 60, 0.4)`
- Synced to the same `glowPhase` counter as the idle glow

## Board Highlights

Drawn as filled rectangle overlays on the board canvas, not as effects.

| Highlight | Color | Trigger |
|---|---|---|
| Selected piece | `rgba(255, 215, 0, 0.55)` (gold) | Click own piece |
| Valid move squares | `rgba(255, 215, 0, 0.35)` + center dot | Piece selected |
| Last move from/to | `rgba(100, 200, 100, 0.3)` (green) | After any move |
