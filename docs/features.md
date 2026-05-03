# Hexchess — Feature Status

Last updated: 2026-05-02

## V1 Features

| Feature | Status | Notes |
|---|---|---|
| Full standard chess rules | ✅ Complete | All 6 piece types, all special rules |
| Pawn movement | ✅ Complete | Single/double push, promotion detection |
| Knight movement | ✅ Complete | |
| Bishop movement | ✅ Complete | Diagonal rays |
| Rook movement | ✅ Complete | Cardinal rays |
| Queen movement | ✅ Complete | Combined rays |
| King movement | ✅ Complete | Including castling |
| Check detection | ✅ Complete | |
| Checkmate detection | ✅ Complete | Scholar's mate verified |
| Stalemate detection | ✅ Complete | |
| Castling (kingside) | ✅ Complete | Checks king path not attacked |
| Castling (queenside) | ✅ Complete | |
| En passant | ✅ Complete | Verified with integration test |
| Pawn promotion (standard) | ✅ Complete | Q/R/B/N choice |
| Turn enforcement | ✅ Complete | Server rejects out-of-turn moves |
| Illegal move rejection | ✅ Complete | Server rejects and emits error_msg |
| Dark stone board aesthetic | ✅ Complete | Dark/ivory squares, gold highlights |
| Lichess SVG piece set | ✅ Complete | cburnett set downloaded |
| Per-move timer (60s default) | ✅ Complete | Configurable via GAME_CONFIG |
| Timer forfeit | ✅ Complete | |
| Timer display in HUD | ✅ Complete | Turns red when ≤10s |
| Atomic upgrade | ✅ Complete | Earned via pawn promotion |
| Promotion upgrade modal | ✅ Complete | 3 cards, 30s countdown, auto-select |
| Screen shake on captures | ✅ Complete | Scaled by piece value |
| Screen shake (Atomic) | ✅ Complete | Heavy shake + red particles |
| Screen shake (checkmate) | ✅ Complete | Max shake + white flash |
| Particle effects | ✅ Complete | Atomic explosion |
| Idle piece glow | ✅ Complete | Color-coded pulse per side |
| Atomic upgrade aura | ✅ Complete | Red glow on pieces with Atomic |
| Movement animation | ✅ Complete | 150ms ease-out cubic slide |
| Piece selection highlights | ✅ Complete | Gold border + overlay |
| Valid move highlights | ✅ Complete | Gold dots |
| Last move highlights | ✅ Complete | Green overlay |
| Board labels (files/ranks) | ✅ Complete | Corner labels |
| Private game rooms | ✅ Complete | Shareable URL with room code |
| Room creation | ✅ Complete | 8-char uppercase room code |
| Room joining via URL | ✅ Complete | `?room=XXXXXXXX` auto-join |
| Waiting screen | ✅ Complete | Lobby with shareable link + copy button |
| Game over screen | ✅ Complete | Winner/draw + reason displayed |
| Disconnection handling | ✅ Complete | 30s window, forfeit, opponent notified |
| WebSocket sync | ✅ Complete | Full game state broadcast |

## Out of Scope for V1

| Feature | Target |
|---|---|
| Bounty system | V2 |
| Board chaos events (Board Flip, Row Shift, etc.) | V2 |
| Fog of war | V2 |
| Haste / Blink / Phase Shift / Extended Range upgrades | V2 |
| Multiple upgrades per piece | V2 |
| Matchmaking queue | V2 |
| Sound effects | V2 |
| Mobile support | V2 |
| Ranked mode | Backlog |
| Spectator mode | Backlog |
| Replay system | Backlog |
