# Hexchess — High Level Product Document

## Vision
Hexchess is a PvP browser-based chess variant where pieces gain upgrades through play, random bounties create hidden incentives, and board chaos events shift the game mid-match. The visual identity is dark fantasy — simple chess pieces brought to life through special effects, screen shake, particles, and animations. Think Wizard Chess from Harry Potter, executed through code not art.

The game starts familiar — it's chess — then surprises you. Every game tells a different story based on what you captured, what promoted, and what chaos the board threw at you.

---

## Core Design Principles
- **Modular first** — every feature (piece type, upgrade, board event, effect) is addable via config, not by rewriting existing logic
- **Server authoritative** — all game logic lives on the server, client only renders and sends input
- **Effects over assets** — visual drama comes from coded effects (shake, particles, glow) not complex art
- **Iterative** — standard chess first, Hexchess mechanics layered on top
- **Document everything** — maintain living documentation as features are built

---

## Tech Stack

### Frontend
- React + TypeScript
- HTML Canvas — game board rendering, animations, effects
- CSS — UI outside the canvas (menus, modals, HUD)

### Backend
- Node.js + TypeScript
- Express — HTTP server
- Socket.io — real-time PvP communication

### Shared
- TypeScript types in `/shared` — single source of truth for all data models, used by both client and server

### Tooling
- Vite — frontend build
- ESLint + Prettier — code consistency
- Monorepo — client, server, shared in one repo

---

## Full Feature Set

### Chess Foundation
- Full standard chess rules
- All piece movement, check/checkmate detection
- Castling, en passant, pawn promotion
- Turn management and game over conditions

### Piece Upgrade System
Upgrades are special abilities attached to individual pieces, earned through gameplay not chosen at start. Multiple upgrades per piece allowed.

**Upgrade pool:**
- **Atomic** — explodes on capture, destroys all adjacent pieces, attacker also dies
- **Haste** — piece may move twice in one turn, once per game
- **Blink** — piece may swap position with any friendly piece, once per game
- **Phase Shift** — bishop only, switches to opposite color diagonal once per game
- **Extended Range** — piece moves +2 squares further than normal

**How upgrades are earned:**
- Pawn promotion — player offered 3 random upgrades to apply to promoted piece
- Capturing a bounty piece — capturing piece receives the bounty upgrade automatically

### Bounty System
At game start, 3-4 random pieces per side are secretly assigned a bounty upgrade. Neither player knows which pieces carry bounties until captured. Capturing a bounty piece grants its upgrade to the attacker and reveals the bounty to both players.

### Board Chaos Events
2-3 events generated at game start, assigned to trigger at specific move numbers. Neither player knows when they fire.

**Event pool:**
- **Board Flip** — all positions mirror 180 degrees, both players now playing from opposite end
- **Random Piece Swap** — two random pieces on the board swap positions
- **Row Shift** — entire rank slides one square, pieces on the edge are removed
- **Fog of War** — neither player can see specific squares for 2 turns

### Visual Effects
All visual drama through coded Canvas effects, not art assets. Pieces use Lichess open source SVG set.

**Screen shake on capture — scales with piece value:**
- Pawn — no shake
- Knight / Bishop — subtle shake
- Rook — medium shake
- Queen — heavy shake
- King / checkmate — maximum shake + full screen flash
- Atomic capture — always heavy shake + explosion particles regardless of piece

**Additional effects:**
- Idle glow — subtle pulse on each piece, color varies by side
- Movement trail — faint trail follows piece across board
- Promotion beam — vertical light beam on pawn promotion
- Bounty reveal flash — golden flash when bounty is revealed
- Board flip animation — smooth rotation over ~500ms with camera shake
- Fog overlay — dark animated overlay during fog event
- Particle burst — on heavy captures and chaos events

### Promotion Flow
- Standard piece promotion applies (queen, rook, bishop, knight)
- Player additionally offered 3 random upgrades for the promoted piece
- 30 second timer to choose or random auto-selected
- Timer visible in UI

### Matchmaking / Lobby
- Create game room with shareable link
- Friend joins via link
- Private games only for MVP
- Room supports exactly 2 players

### Time Controls
- Configurable per-move timer — not hardcoded, stored in game config
- Default 60 seconds per move
- Forfeit on timeout
- Future: timer manipulation upgrades (steal opponent time, add time on capture)

### Disconnection Handling
- 30 second reconnection window
- Forfeit if player does not reconnect in time

---

## Future Features (Backlog)
These are not planned for any current version but should be kept in mind when making architectural decisions:

- New piece types (Archbishop, Chancellor from Capablanca Chess)
- Additional upgrades beyond initial pool
- Timer manipulation mechanics
- Fog of war event
- Ranked matchmaking
- Spectator mode
- Replay system
- Mobile client
- Steam release via Electron + Godot migration
- Sound effects and music
- Cosmetic piece skins (Midjourney generated, imported as sprites)

---

## Modular Code Requirements
These apply to the entire codebase across all versions:

1. **Config-driven features** — pieces, upgrades, and board events defined in config objects. Game logic reads from config, never has feature names hardcoded.
2. **Pure functions for game logic** — all state transitions are pure functions: take current state + action, return new state. No side effects in game logic.
3. **Separation of concerns** — game logic knows nothing about rendering. Rendering knows nothing about networking. Networking knows nothing about effects.
4. **Effect event bus** — game events emit named events (e.g. `capture:queen`, `event:board_flip`). Effects system subscribes and plays the appropriate effect. Adding a new effect never requires touching game logic.
5. **Typed everything** — no `any` types. All data structures defined in `/shared/types.ts`.
6. **Small files** — each file has one clear responsibility. Split if exceeding ~200 lines.

---

## Documentation Requirements
Maintain living documents in `/docs`, updated as features are built:

- `architecture.md` — how the major pieces connect
- `features.md` — status of every feature (planned / in progress / complete)
- `upgrade-config.md` — all implemented upgrades with effect descriptions
- `event-config.md` — all implemented board events with trigger conditions
- `effects.md` — all visual effects, what triggers them, their parameters
- `decisions.md` — log of major technical decisions and reasoning. Format: date, decision, reasoning.