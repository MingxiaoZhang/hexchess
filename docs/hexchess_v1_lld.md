# Hexchess — V1 Low Level Design

## Goal
Build a verifiable, playable prototype that feels meaningfully different from regular chess. Two players can connect, play a full game with a timer, and experience at least one Hexchess mechanic (Atomic upgrade) and the screen shake effect system.

## What V1 Is
- Full standard chess, two players, real-time via WebSocket
- Dark stone board aesthetic
- Lichess SVG piece set
- Configurable per-move timer (default 60 seconds)
- Screen shake on captures, scaled by piece value
- Atomic upgrade — earned only through pawn promotion
- Pawn promotion offers 3 random upgrades (Atomic is the only one in the pool for V1)
- Private game rooms via shareable link

## What V1 Is NOT
- No bounty system
- No board chaos events
- No fog of war
- No multiple upgrade types beyond Atomic
- No matchmaking queue
- No sound
- No mobile support

---

## Project Structure

```
hexchess/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── Lobby.tsx           # Room creation and join screen
│   │   │   ├── GameScreen.tsx      # Main game layout wrapper
│   │   │   ├── HUD.tsx             # Timer, captured pieces, player info
│   │   │   └── PromotionModal.tsx  # Upgrade picker on pawn promotion
│   │   ├── canvas/
│   │   │   ├── renderer.ts         # Board and piece drawing
│   │   │   ├── effects.ts          # Screen shake, particles, glow
│   │   │   └── animations.ts       # Piece movement animation
│   │   ├── socket/
│   │   │   └── client.ts           # Socket.io client and event handlers
│   │   └── store/
│   │       └── gameStore.ts        # Client-side display state (Zustand)
├── server/
│   ├── src/
│   │   ├── game/
│   │   │   ├── chess.ts            # Standard chess rules and validation
│   │   │   ├── upgrades.ts         # Upgrade config and application logic
│   │   │   └── state.ts            # Game state management
│   │   ├── rooms.ts                # Room creation and player management
│   │   └── socket.ts               # Socket.io event handlers
└── shared/
    └── types.ts                    # All shared TypeScript types
```

---

## Shared Types
All types defined in `/shared/types.ts` before any logic is written.

Key types needed for V1:
- `PieceType` — pawn, rook, knight, bishop, queen, king
- `Color` — white, black
- `Position` — row, col (0-7)
- `Upgrade` — id, name, description, effect type, uses remaining
- `Piece` — id, type, color, position, upgrades array
- `GameState` — board, pieces, currentTurn, phase, moveNumber, timer config
- `Move` — pieceId, from, to, capturedPieceId, upgradeUsed
- `GamePhase` — waiting, active, promotion, complete
- `PromotionChoice` — pieceId, upgradeOptions array
- `RoomConfig` — moveTimerSeconds (configurable, not hardcoded)

---

## Game Config
Store all configurable values in a single config object on the server, not scattered as hardcoded values:

```
GameConfig {
  moveTimerSeconds: 60        // default, changeable per room in future
  upgradePool: [Atomic]       // only Atomic in V1, array makes adding more trivial
  promotionUpgradeCount: 3    // how many options shown on promotion
  reconnectionWindowMs: 30000 // 30 seconds
}
```

---

## Upgrade Config
Upgrades defined as config entries, not hardcoded into game logic. Each upgrade has:
- id
- name
- description
- maxPerPiece (for future multiple upgrade balancing)
- effect function reference

**V1 upgrade — Atomic:**
- On capture, remove the capturing piece, remove the captured piece, remove all pieces adjacent to the captured square (kings excluded from removal)
- Triggers heavy screen shake + particle explosion on the client
- Uses: unlimited (fires every time the piece captures)

---

## Standard Chess Rules Checklist
Implement and verify each before moving to Hexchess mechanics:

- [ ] Piece movement — all 6 piece types
- [ ] Capture logic
- [ ] Check detection
- [ ] Checkmate detection
- [ ] Stalemate detection
- [ ] Castling — kingside and queenside
- [ ] En passant
- [ ] Pawn promotion — standard piece selection
- [ ] Turn enforcement
- [ ] Illegal move rejection

---

## Hexchess Mechanics — V1

### Atomic Upgrade Delivery
- Atomic is the only upgrade in the pool for V1
- When a pawn promotes, server pauses game (phase = 'promotion')
- Server sends 3 upgrade options to the promoting player (all Atomic in V1, shown as 3 cards for UI testing)
- Player selects one, server applies it to the promoted piece
- Game resumes

### Atomic Capture Resolution
When a piece with Atomic captures:
1. Remove captured piece from board
2. Remove all pieces adjacent to captured square (except kings)
3. Remove the attacking piece itself
4. Check for checkmate/game over resulting from explosion
5. Emit capture event with `atomic: true` flag to client

---

## Networking

### Socket Events — V1

**Client → Server:**
- `create_room` — creates a new game room, returns roomId
- `join_room` — join existing room by roomId
- `make_move` — { roomId, pieceId, from, to }
- `use_upgrade` — { roomId, pieceId, upgradeId, targetPosition? }
- `choose_promotion` — { roomId, pieceType, upgradeId }

**Server → Client:**
- `room_created` — { roomId, shareUrl }
- `game_start` — { gameState, yourColor }
- `move_result` — { gameState, move, atomic: boolean }
- `promotion_required` — { pieceId, upgradeOptions }
- `timer_update` — { secondsRemaining }
- `game_over` — { winner, reason } — reason: checkmate | timeout | forfeit | disconnect

---

## Visual Design

### Board
- Dark grey/charcoal dark squares
- Aged ivory light squares
- Gold accent color for highlights, selected squares, valid move indicators
- Board fills most of the viewport, responsive to window size

### Pieces
- Lichess open source SVG piece set
- Pieces with Atomic upgrade show a subtle red aura/glow
- No other visual modification to pieces in V1

### Screen Shake — Scaled by Piece Value
Shake is applied to the entire canvas element:

| Captured piece | Amplitude | Duration |
|---|---|---|
| Pawn | 0 | 0 |
| Knight / Bishop | 3px | 200ms |
| Rook | 6px | 300ms |
| Queen | 12px | 400ms |
| Atomic capture | 15px | 500ms + particles |
| Checkmate | 20px | 600ms + flash |

### Movement Animation
- Piece slides from origin to destination over ~150ms
- No instant teleport
- Easing: ease-out

### Promotion Modal
- Appears centered over board
- Shows 3 upgrade cards
- Each card: upgrade name, description, icon placeholder
- 30 second countdown timer visible
- Auto-selects random if timer expires

---

## Build Order
Build strictly in this sequence. Verify each step before proceeding.

1. **Project setup** — monorepo, TypeScript, Vite, Socket.io, ESLint
2. **Shared types** — define all types in `/shared/types.ts`
3. **Standard chess logic** — server-side only, all rules from checklist above
4. **Basic canvas renderer** — draw board and pieces, no interactivity, dark stone aesthetic
5. **Click to move** — piece selection, valid move highlights, move submission via socket
6. **WebSocket sync** — two players, real-time move broadcast, game state sync
7. **Per-move timer** — configurable, countdown visible in HUD, forfeit on timeout
8. **Atomic upgrade config** — define in config, implement effect function
9. **Promotion flow** — pause game, show modal, apply upgrade, resume
10. **Screen shake** — implement effect system, wire to capture events, scale by piece value
11. **Movement animation** — smooth piece sliding
12. **Lobby** — room creation, shareable URL, join flow, waiting screen
13. **Disconnection handling** — 30 second window, forfeit, notify opponent

---

## Definition of Done for V1
V1 is complete when:
- Two players can play a full game of chess from separate browsers
- Per-move timer counts down and forfeits on timeout
- Pawn promotion triggers upgrade modal
- A piece with Atomic upgrade explodes correctly on capture
- Screen shake fires and scales correctly by piece value
- Game correctly detects checkmate and declares winner
- Disconnection is handled gracefully