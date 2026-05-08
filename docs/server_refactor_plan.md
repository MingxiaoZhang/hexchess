# Hexchess — Server Refactor Plan

## Context

Three problems have emerged as the codebase grows:

1. **`socket.ts` is 728 lines** mixing event wiring, game orchestration, timer management, mutation queue processing, AI scheduling, and utilities — six responsibilities in one file. Every new game phase adds code in multiple places.

2. **The AI is entangled with the socket layer.** Berserk second capture, Echo resolution, promotion auto-selection, and mutation acceptance are all special-cased in separate functions scattered across `socket.ts`. Adding a new game phase in V4 will require touching all of them again.

3. **No mechanism to detect silent state drift.** If a client misses an event, it renders stale state with no way to know.

This document describes the target architecture and the design decisions behind it.

---

## Design Decision 1: Phase is Derived, Not Stored

### Problem with the current approach

`GameState.phase` is currently set explicitly in every handler:
```typescript
{ ...state, phase: 'mutation' }
{ ...state, phase: 'ability_pending' }
{ ...state, phase: 'active' }
```

This creates a class of bugs: `phase` can disagree with the rest of the state. For example, `phase === 'active'` while `abilityPending` is set, or `phase === 'mutation'` while `mutationQueue` is empty. These mismatches are hard to detect and cause silent failures.

### Solution: Derive phase from state

The phase is a pure function of the other state fields:

```typescript
function derivePhase(state: Omit<GameState, 'phase'>): GamePhase {
  if (state.winner !== undefined)     return 'complete';
  if (state.promotionPending)         return 'promotion';
  if (state.abilityPending)           return 'ability_pending';
  if (state.mutationQueue.length > 0) return 'mutation';
  return 'active'; // or 'waiting' if players haven't joined
}
```

**Priority ordering** (top = highest precedence):
1. `complete` — game over, nothing else matters
2. `promotion` — pawn must be promoted before any other action
3. `ability_pending` — ability follow-up must resolve before game continues
4. `mutation` — mutation offer must be accepted/declined
5. `active` — normal play

`phase` becomes a computed field: always set by calling `derivePhase` at the end of any state mutation, never set by hand. This eliminates the entire category of phase/state disagreement bugs.

**What this means in practice:**
- To enter `ability_pending`: set `abilityPending` on the state object. Phase derives automatically.
- To exit `ability_pending`: clear `abilityPending`. Phase drops back to `active` (or `mutation` if there are queued mutations).
- Adding a new blocking phase in V4 = add one field to GameState and one line in `derivePhase`.

---

## Design Decision 2: `processOutcome` as the Single Transition Function

### Problem

After every action (move, ability use, promotion choice, etc.) the code must determine what happens next: start a timer, process the mutation queue, enter ability pending, or end the game. This logic is currently duplicated in every event handler.

### Solution

One function owns all post-action logic:

```typescript
function processOutcome(io: Server, room: Room, broadcastPayload: BroadcastPayload): void {
  const state = room.state;

  // 1. Always broadcast current state to all clients
  broadcast(io, room, broadcastPayload);

  // 2. Determine next action based on phase
  switch (state.phase) {
    case 'complete':
      broadcastGameOver(io, room);
      return;

    case 'promotion':
      clearMoveTimer(room);
      if (isAIColor(room, room.state.promotionPending?.piece.color)) {
        scheduleAITurn(io, room, FAST_DELAY); // AI resolves immediately
      } else {
        startPromotionTimer(io, room);
        emitPromotionRequired(io, room);
      }
      return;

    case 'ability_pending':
      clearMoveTimer(room);
      if (isAIColor(room, room.state.abilityPending?.pieceColor)) {
        scheduleAITurn(io, room, FAST_DELAY);
      } else {
        startAbilityPendingTimer(io, room);
      }
      return;

    case 'mutation':
      clearMoveTimer(room);
      processMutationQueue(io, room); // handles AI auto-accept internally
      return;

    case 'active':
      startMoveTimer(io, room);
      scheduleAITurn(io, room); // no-op if it's the human's turn
      return;
  }
}
```

Every action handler becomes:

```typescript
function applyMoveAction(io, room, pieceId, to, color): void {
  const outcome = state.handleMove(room.state, pieceId, to, color);
  if (!outcome) { emitError(io, room, 'Illegal move'); return; }

  room.state = outcome.newState;
  clearMoveTimer(room);
  processOutcome(io, room, { type: 'move_result', move: outcome.move, atomic: outcome.atomic });
}
```

The handler is now 5 lines. All the phase branching lives in `processOutcome`.

---

## Design Decision 3: AI as a Player

### Problem

The AI has special execution paths throughout `socket.ts`: `triggerAIMove`, `handleAIAbilityPending`, and branching in every event handler. Adding a new game phase requires updating all of them.

### Solution

The AI generates the same inputs a human player would send. It goes through the same action handlers. No special paths.

```typescript
// ai.ts — pure, no side effects
export function getAIAction(state: GameState, aiColor: Color): AIAction | null {
  switch (state.phase) {
    case 'active':
      if (state.currentTurn !== aiColor) return null;
      return chooseBestAction(state, aiColor); // move or ability

    case 'ability_pending':
      if (state.abilityPending?.pieceColor !== aiColor) return null;
      return resolvePendingAbility(state, aiColor);

    case 'promotion':
      const pp = state.promotionPending;
      if (!pp || state.pieces[pp.pieceId]?.color !== aiColor) return null;
      return { type: 'promote', pieceId: pp.pieceId, pieceType: 'queen',
               upgradeId: pp.upgradeOptions[0]?.id ?? '' };

    case 'mutation':
      const m = state.mutationQueue[0];
      if (m?.ownerColor !== aiColor) return null;
      return { type: 'accept_mutation', pieceId: m.pieceId,
               mutationId: m.mutations[0]?.id ?? '' };

    default:
      return null;
  }
}

// ai-runner.ts — execution only, calls engine functions
export function scheduleAITurn(io, room, delay = 700): void {
  if (!room.hasAI || !room.aiColor) return;
  if (!shouldAIAct(room.state, room.aiColor)) return;
  clearTimeout(room.aiTimer);
  room.aiTimer = setTimeout(() => executeAITurn(io, room), delay + jitter());
}

function executeAITurn(io, room): void {
  const action = getAIAction(room.state, room.aiColor!);
  if (!action) return;

  switch (action.type) {
    case 'move':           applyMoveAction(io, room, action.pieceId, action.to, room.aiColor!); break;
    case 'ability':        applyAbilityAction(io, room, ...action, room.aiColor!); break;
    case 'promote':        applyPromotionAction(io, room, ...action, room.aiColor!); break;
    case 'accept_mutation': applyMutationAccept(io, room, ...action, room.aiColor!); break;
  }
  // processOutcome will schedule the next AI turn if needed
}
```

**Adding a new game phase** (V4 example: `board_chaos`):
1. Add `boardChaosPending` to `GameState`
2. Add one line to `derivePhase`
3. Add one `case 'board_chaos':` in `processOutcome`
4. Add one `case 'board_chaos':` in `getAIAction`
5. Zero changes to event handlers

---

## Design Decision 4: Ability System Extensibility

Abilities are acknowledged to be temporary — they will be added, changed, and removed. The system should tolerate this.

### Principle: Abilities only affect state, never phase directly

An ability's effect is expressed entirely as a transformation of `GameState`. The phase is then derived from that new state. Abilities do not call `processOutcome` or start timers — that's the engine's job.

```typescript
// What an ability returns:
interface AbilityEffect {
  newState: GameState;     // state after the ability is applied
  turnEnds: boolean;       // does using this ability consume the turn?
  // Phase is derived from newState automatically — ability never sets it
}
```

### Adding a new ability in V4+

1. Add an entry to `ABILITY_CONFIGS` in `config.ts` (id, name, description, tags, maxUses)
2. Add a case in `abilities.ts` that returns an `AbilityEffect`
3. If the ability creates a multi-step interaction (like Berserk's second capture):
   - Add a new `abilityPending.type` discriminant
   - Add a case in `getAIAction` for the pending phase
   - Add a UI component for the pending state
4. Zero changes to engine, socket, or state machine

### Removing or changing an ability

Delete or modify the config entry and the `abilities.ts` case. Nothing else needs to change.

### What "positional cost" means for the architecture

The LLD describes ability costs as positional (no territorial gain, exposure, immobility). These are implemented as **flags on piece state** (`surgeExposed`, `anchorTurnsRemaining`, etc.), not as game phase changes. The state machine only needs to know about interrupts (multi-step abilities). Positional costs are invisible to it.

---

## Design Decision 5: Anti-Entropy via stateVersion

### Problem

If a client misses a broadcast (brief disconnect, network hiccup, backgrounded tab), it renders stale state with no way to know. Socket.io Connection State Recovery helps but has documented failure cases.

### Solution

**`stateVersion`**: a monotonic integer, incremented server-side after every validated action. Sent alongside every broadcast.

```typescript
// Room-level counter (not in GameState — it's infrastructure, not game logic)
room.stateVersion = 0;
// After every action that changes state:
room.stateVersion++;
io.to(room.id).emit('move_result', { gameState, move, atomic, stateVersion: room.stateVersion });
```

**Client gap detection**:
```typescript
let lastSeenVersion = -1;

socket.on('move_result', (payload) => {
  if (lastSeenVersion !== -1 && payload.stateVersion !== lastSeenVersion + 1) {
    socket.emit('request_resync'); // gap detected
    return; // wait for full state before applying
  }
  lastSeenVersion = payload.stateVersion;
  applyState(payload.gameState);
});

socket.on('state_full', (payload) => {
  lastSeenVersion = payload.stateVersion;
  applyState(payload.gameState); // replace entire local state
});
```

**Server resync handler**:
```typescript
socket.on('request_resync', () => {
  socket.emit('state_full', {
    gameState: sanitizeStateForPlayer(room.state, player.color),
    stateVersion: room.stateVersion,
  });
});
```

**On reconnect**: always send `state_full` regardless of Socket.io recovery success. This is the unconditional safety net.

**Optional: heartbeat checksum** (lower priority):
```
Every 30 seconds: server emits { stateVersion, checksum: hash(room.state) }
Client hashes local state and compares
Mismatch → request_resync
```

---

## Design Decision 6: Store Abstraction

### Problem

All game state lives in a `Map<string, Room>` in `rooms.ts`. The `Room` type mixes two categories of data:
- **Serializable state** (game position, player records, move history) — can be persisted to Redis/Postgres
- **Runtime handles** (timers, socket ID mappings) — cannot be serialized, must be reconstructed fresh

Without separating these, adding persistence later requires touching every function that creates or mutates a room.

### The Split

```typescript
// Serializable — can be written to Redis, Postgres, etc.
interface GameRoom {
  id: string;
  stateVersion: number;   // monotonic counter for anti-entropy
  state: GameState;
  players: PlayerRecord[]; // color, reconnectToken, connected — no socket handles
  hasAI: boolean;
  aiColor: Color | null;
  secondsRemaining: number;
}

interface PlayerRecord {
  color: Color;
  reconnectToken: string;
  connected: boolean;
}

// In-memory only — extends GameRoom with runtime handles
interface RoomRuntime extends GameRoom {
  socketToColor: Map<string, Color>;   // socket.id → color
  colorToSocket: Map<Color, string>;   // color → socket.id
  reconnectTimers: Map<Color, ReturnType<typeof setTimeout>>;
  moveTimer: ReturnType<typeof setTimeout> | null;
  moveTimerStartedAt: number | null;
  promotionTimer: ReturnType<typeof setTimeout> | null;
  mutationTimer: ReturnType<typeof setTimeout> | null;
  abilityPendingTimer: ReturnType<typeof setTimeout> | null;
  aiTimer: ReturnType<typeof setTimeout> | null;
}
```

### Store Interface (async from day one)

```typescript
interface RoomStore {
  get(roomId: string): Promise<GameRoom | null>;
  save(room: GameRoom): Promise<void>;
  delete(roomId: string): Promise<void>;
  findByToken(token: string): Promise<GameRoom | null>;
  all(): Promise<GameRoom[]>;
}
```

### Engine Context

All engine functions receive a context object rather than having io/store/runtimes threaded as individual parameters:

```typescript
interface EngineContext {
  io: Server;
  store: RoomStore;                    // persistence abstraction
  runtimes: Map<string, RoomRuntime>;  // in-memory working set
}
```

### V3: InMemoryRoomStore (trivial implementation)

```typescript
class InMemoryRoomStore implements RoomStore {
  constructor(private runtimes: Map<string, RoomRuntime>) {}

  async get(id: string): Promise<GameRoom | null> {
    const rt = this.runtimes.get(id);
    return rt ? toGameRoom(rt) : null;
  }
  async save(room: GameRoom): Promise<void> {
    const rt = this.runtimes.get(room.id);
    if (rt) Object.assign(rt, room); // update in-place
  }
  async delete(id: string): Promise<void> { this.runtimes.delete(id); }
  // ...
}
```

### Future implementations

| Implementation | When | What changes |
|---|---|---|
| `InMemoryRoomStore` | V3 | Thin wrapper around in-memory Map |
| `RedisRoomStore` | Horizontal scaling | `save()` writes JSON to Redis, `get()` reads from Redis |
| `PostgresRoomStore` | Full persistence + replay | save() writes to DB with versioned event log |

**What never changes:** engine.ts, ai.ts, socket.ts — they only interact with the `RoomStore` interface and `RoomRuntime` type.

### Conversion utilities

```typescript
function toGameRoom(rt: RoomRuntime): GameRoom {
  // strip timer handles, return only serializable fields
}

function fromGameRoom(room: GameRoom): RoomRuntime {
  // reconstruct runtime with all handles initialized to null/empty
}
```

Migration path: when you add Redis, `fromGameRoom` reconstructs the runtime from the loaded snapshot. On first use after a server restart, all timers are null (harmless — they only activate when a game action occurs).

---

## Target File Structure

```
server/src/
├── socket.ts              (~150 lines) — event registration only
│   • maps socket events to engine functions
│   • no business logic, no timers, no AI
│
├── store/
│   ├── types.ts           — GameRoom, RoomRuntime, PlayerRecord
│   │                        toGameRoom(), fromGameRoom() utilities
│   └── RoomStore.ts       — RoomStore interface + InMemoryRoomStore
│
└── game/
    ├── engine.ts          (~300 lines) — game orchestration
    │   • applyMoveAction, applyAbilityAction, applyPromotion
    │   • applyMutationAccept/Decline, applyDeclineAbilityPending
    │   • processOutcome — single post-action dispatch
    │   • startGame, broadcastGameOver
    │   • all timers (startMoveTimer, startPromotionTimer, etc.)
    │   • processMutationQueue
    │
    ├── ai.ts              (~200 lines) — pure decisions
    │   • getAIAction(state, aiColor) — handles ALL phases
    │   • scoring functions — no io/room/timers
    │
    ├── ai-runner.ts       (~80 lines) — AI execution
    │   • scheduleAITurn — single entry point
    │   • executeAITurn — calls engine functions (same paths as human)
    │
    ├── chess.ts           (unchanged)
    ├── state.ts           (+derivePhase, +withDerivedPhase)
    ├── abilities.ts       (use withDerivedPhase)
    ├── triggers.ts        (unchanged)
    └── upgrades.ts        (unchanged)
```

---

## Implementation Plan

### Phase 1 — Derive phase from state (prerequisite)
- Add `derivePhase(state)` utility
- Update all state mutations in `state.ts` and `abilities.ts` to call it
- Add an assertion that catches phase/state disagreements in dev

### Phase 2 — `engine.ts`
- Extract all orchestration logic from `socket.ts` into `engine.ts`
- Implement `processOutcome` as the single post-action dispatch
- `socket.ts` becomes: event wiring that calls engine functions

### Phase 3 — AI refactor
- Expand `getAIAction` in `ai.ts` to handle all phases
- Create `ai-runner.ts` with `scheduleAITurn` as single entry point
- `executeAITurn` calls engine functions — no special AI paths anywhere else
- Delete `triggerAIMove`, `handleAIAbilityPending`, `scheduleAIMoveIfNeeded`

### Phase 4 — Anti-entropy
- Add `stateVersion` counter to `Room`
- Include in every broadcast from `processOutcome`
- Add `request_resync` handler
- Add client-side gap detection and resync request

### Testing between phases
- After Phase 1: verify all phases still transition correctly (existing tests)
- After Phase 2: verify socket events still work end-to-end
- After Phase 3: verify AI makes second captures, handles all phases
- After Phase 4: verify reconnect + stale-state scenarios

---

## What This Enables for V4+

| V4 feature | Changes needed |
|---|---|
| Board chaos event (new phase) | 1 field in GameState, 1 line in `derivePhase`, 1 case in `processOutcome`, 1 case in `getAIAction` |
| New ability with pending | Ability config + effect function + 1 `abilityPending.type` + AI case |
| Remove/change an ability | Delete/modify config entry + abilities.ts case |
| New mutation type | Config entry + effect function — 0 changes to socket/engine |
| Spectator mode | `socket.ts` handles spectator join, `processOutcome` broadcasts to spectators automatically |
| Replay | Event log can be added to `processOutcome` without touching game logic |
