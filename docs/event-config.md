# Hexchess — Board Event Config

Board chaos events are a **V2 feature**. This document pre-defines the configuration structure so events can be added without restructuring existing code.

## Planned Event Pool (V2)

Events will be defined as config entries in `GAME_CONFIG` (or a separate `EVENT_CONFIG`). Each event has:
- `id` — unique string key
- `name` — display name
- `description` — player-visible description
- `triggerCondition` — `{ type: 'move_number', value: number }` | future types
- `applyEffect` — function reference `(state: GameState) => GameState`

### Board Flip
Mirrors all piece positions 180 degrees. Both players now play from the opposite end.

### Random Piece Swap
Two random pieces on the board exchange positions.

### Row Shift
An entire rank slides one square left or right. Pieces on the edge are removed.

### Fog of War
Neither player can see specific squares for N turns (V2 implementation TBD).

## Adding Events (When V2 Arrives)

1. Add entry to event config array
2. Implement `applyEffect(state): GameState` as a pure function
3. In `game/state.ts`, check if `state.moveNumber` matches any event trigger after each move
4. Emit an effect event to the client (effect bus)
5. Client `effects.ts` / `renderer.ts` subscribes and plays the appropriate visual effect

No changes to socket.ts or chess.ts needed.
