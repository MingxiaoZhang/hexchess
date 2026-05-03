# Hexchess — Architecture

## Overview

Three-package npm workspace monorepo: `shared`, `server`, `client`.

```
Browser A                     Browser B
   │                             │
   ▼                             ▼
[React UI]                  [React UI]
[Canvas renderer]           [Canvas renderer]
[Socket.io client]────────────[Socket.io client]
        │                             │
        └─────────┐   ┌──────────────┘
                  ▼   ▼
            [Socket.io server]  (port 3001)
                  │
            [Room manager]
                  │
            [Game state manager]
                  │
            [Chess engine (pure functions)]
```

## Packages

### `/shared`
Single TypeScript file (`src/types.ts`) that defines all data structures used by both client and server. No logic — types only. Imported via `@hexchess/shared` path alias in both projects.

### `/server`
Node.js + Express + Socket.io. Entry point: `src/index.ts`.

| File | Responsibility |
|---|---|
| `src/game/chess.ts` | All standard chess rules. Pure functions only — no side effects, no I/O. |
| `src/game/upgrades.ts` | Upgrade pool config and option drawing. |
| `src/game/state.ts` | Game phase management: move handling, promotion flow, timeouts, game-over detection. Orchestrates chess.ts functions. |
| `src/rooms.ts` | Room lifecycle: create, join, player tracking, timer handles. |
| `src/socket.ts` | Socket.io event registration. Bridges socket events to game/room logic. Owns all timers (move timer, promotion timer, reconnect window). |
| `src/config.ts` | Single `GAME_CONFIG` object — all configurable values live here. |

### `/client`
React + Vite. Entry point: `src/main.tsx`.

| File | Responsibility |
|---|---|
| `src/store/gameStore.ts` | Zustand store — client display state (game state mirror, timer, selection, promotion). |
| `src/socket/client.ts` | Socket.io client. Receives server events, writes to store, exposes action functions. Knows nothing about rendering. |
| `src/canvas/renderer.ts` | Board and piece drawing. Reads from passed-in state, produces pixels. Knows nothing about networking. |
| `src/canvas/effects.ts` | Screen shake, particles, flash. Purely visual, stateless relative to game logic. |
| `src/canvas/animations.ts` | Piece movement interpolation (ease-out cubic, 150ms). |
| `src/components/GameScreen.tsx` | Wires canvas, effects, and move submission together. Handles click-to-select / click-to-move. |
| `src/components/HUD.tsx` | Timer display and player info sidebar. |
| `src/components/PromotionModal.tsx` | Upgrade picker overlay with 30s countdown. |
| `src/components/Lobby.tsx` | Room creation and join UI. |

## Key Principles

**Server is the only authority.** Client sends `make_move` — server validates, applies, and broadcasts the new state. Client-side valid-move highlighting is for UX only; the server rejects any illegal move.

**Pure game logic.** All state transitions in `chess.ts` are pure functions: `(GameState, …) → GameState`. No I/O, no timers, no Socket.io references.

**Effect event bus (V1 form).** `socket/client.ts` calls `onMoveResult(cb)` which the GameScreen subscribes to. That callback decides which effects to fire. Game logic never calls into the effects system.

**Config-driven.** `GAME_CONFIG` in `config.ts` owns all tunable values: timer length, upgrade pool, promotion count, reconnect window.

## Data Flow: Making a Move

1. User clicks canvas → `handleCanvasClick` resolves board position
2. If a friendly piece is selected and the target is in `validMoves` → `makeMove(roomId, pieceId, from, to)` emitted
3. Server `socket.ts` receives `make_move` → delegates to `handleMove` in `state.ts`
4. `handleMove` calls `getValidMoves` (chess.ts) to re-validate, then `applyMove` to produce new state
5. Server emits `move_result` to all players in the room
6. Client `socket/client.ts` receives `move_result` → updates Zustand store → triggers React re-render
7. `onMoveResult` callback fires → effects triggered (shake, particles, animation)
8. Canvas render loop reads updated store → redraws board
