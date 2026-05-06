# Hexchess — Feature Status

Last updated: 2026-05-03

## V1 Features (all complete, all verified in V2)

| Feature | Status |
|---|---|
| Full standard chess rules (all 6 piece types, castling, en passant, promotion) | ✅ Complete |
| Server-authoritative move validation | ✅ Complete |
| Real-time PvP via WebSocket | ✅ Complete |
| Dark stone board aesthetic + Lichess SVG pieces | ✅ Complete |
| Per-move timer (60s default, configurable) | ✅ Complete |
| Timer forfeit | ✅ Complete |
| Pawn promotion flow (Q/R/B/N choice + upgrade pick) | ✅ Complete |
| Atomic upgrade (via promotion) | ✅ Complete |
| Screen shake scaled by captured piece value | ✅ Complete |
| Particle effects on Atomic explosion | ✅ Complete |
| Movement animation (150ms ease-out) | ✅ Complete |
| Idle piece glow + Atomic red aura | ✅ Complete |
| Board highlights (selection, valid moves, last move) | ✅ Complete |
| Board labels | ✅ Complete |
| Private game rooms with shareable URL | ✅ Complete |
| Lobby (create / join) | ✅ Complete |
| Game-over screen | ✅ Complete |
| Disconnection handling (30s window, forfeit) | ✅ Complete |

## V3 Features

| Feature | Status | Notes |
|---|---|---|
| Ability draw system (3 random per player at game start) | ✅ Complete | Without replacement from 6-ability pool |
| Berserk | ✅ Complete | Auto-triggers after capture; second capture via ability_pending phase; piece exposed 1 opponent move |
| Long Strike | ✅ Complete | Removes enemy in attack range; piece stays; 1 use; Atomic combo supported |
| Phantom | ✅ Complete | Moves through first blocker on ray; 1 use; phantomNoCapture next turn |
| Anchor | ✅ Complete | Piece immune to capture + immovable for 2 owning-player turns; unlimited uses |
| Echo | ✅ Complete | Copies opponent's last ability; enters echo_pending; 1 use |
| Surge | ✅ Complete | Pawn moves 1-3 squares forward; surgeExposed for 1 opponent turn; unlimited uses |
| Ability card UI (up to 5 cards) | ✅ Complete | Shows name, icon, uses remaining; selectable to arm |
| Ability selection on board | ✅ Complete | Click card → click piece → click target; Berserk uses pending phase |
| Berserk second capture pending | ✅ Complete | 15s timer, skip button, auto-advance on timeout |
| Echo pending | ✅ Complete | 15s timer, allows using copied ability |
| Surge-exposed: any piece can capture | ✅ Complete | Bypasses pin validation in getValidMoves |
| Anchored: cannot be captured or moved | ✅ Complete | Enforced in getValidMoves |
| Phantom no-capture next turn | ✅ Complete | Enforced in getValidMoves |
| AI uses abilities (Berserk on knights near trigger, Surge on pawns near rank 5) | ✅ Complete | |
| Ability state ticks each turn | ✅ Complete | anchorTurnsRemaining, surgeExposed, berserkExposedTurns, phantomNoCapture |
| Opponent ability hand shown (hidden cards) | ✅ Complete | sanitizeStateForPlayer hides opponent's card IDs |

## V2 Features

| Feature | Status | Notes |
|---|---|---|
| Per-piece mutation trigger system | ✅ Complete | Config-driven, verified for all 5 piece types |
| Pawn advance trigger (crosses rank 5/4) | ✅ Complete | White: row ≤ 3, Black: row ≥ 4 |
| Knight captures trigger (2 captures) | ✅ Complete | triggerCount tracks per-piece |
| Bishop revenge trigger | ✅ Complete | Fires on surviving bishop when partner captured |
| Rook opposition trigger | ✅ Complete | Only when rook itself moves into opposition |
| Queen checks trigger (2 checks) | ✅ Complete | Counts direct checks from queen moves |
| Mutation modal (V2-ready for multiple options) | ✅ Complete | Built to accept multiple mutation types from V3 |
| 15-second mutation timer (auto-decline) | ✅ Complete | |
| Accept / decline mutation flow | ✅ Complete | Both players notified of outcome |
| Atomic mutation via trigger (in addition to promotion) | ✅ Complete | |
| Mutation outcome toast notification | ✅ Complete | Shown to both players for 3 seconds |
| Atomic visual aura on mutated pieces | ✅ Complete | Red glow (reuses V1 Atomic aura) |
| Basic AI opponent | ✅ Complete | Pursues triggers: captures, pawn advance, rook opposition |
| AI accepts mutations automatically | ✅ Complete | |
| AI auto-promotes to queen | ✅ Complete | |
| "Play vs AI" lobby option | ✅ Complete | |

## Out of Scope for V2

| Feature | Target |
|---|---|
| Ability card system (Berserk, Long Strike, etc.) | V3 |
| Additional mutations beyond Atomic | V3 |
| Trigger + ability combos | V3 |
| Archetypes / weighted draws | V3 |
| Bounty system | V3 |
| Board chaos events | V3 |
| Fog of war | V3 |
| Ranked mode | Backlog |
| Sound effects | Backlog |
| Mobile support | Backlog |
