# Hexchess — Technical Decisions Log

## 2026-05-02 — Monorepo with npm workspaces

**Decision:** Use npm workspaces with three packages: `shared`, `server`, `client`.

**Reasoning:** Allows TypeScript to be shared directly between client and server without a build step. Each package has its own `node_modules` but shares a root `node_modules`. The `@hexchess/shared` path alias resolves to `../shared/src/types` at compile time and at runtime (via tsconfig paths for tsx, Vite alias for client). Simple, no extra tooling like Turborepo needed for V1 scope.

---

## 2026-05-02 — Board coordinate system

**Decision:** `board[row][col]` where row 0 = rank 8 (black's back rank), row 7 = rank 1 (white's back rank). Col 0 = a-file, col 7 = h-file.

**Reasoning:** Natural array indexing (top-to-bottom = 0-to-7). White pieces are at rows 6-7. Black at rows 0-1. Pawn direction: white = -1 (decreasing row), black = +1 (increasing row). Canvas rendering flips the board for the black player using `7 - row` and `7 - col` transforms.

---

## 2026-05-02 — Piece IDs

**Decision:** Stable string IDs like `w_pawn_4` (white pawn on e-file = col 4). Back rank pieces: `w_rook_0`, `w_knight_1`, etc. IDs never change — even after promotion, the pawn's ID is retained.

**Reasoning:** Simple and predictable. The server and client can refer to pieces by ID unambiguously. Promotion changes the `type` field, not the ID. En passant capture correctly references the captured pawn by ID. If piece deduplication becomes an issue (e.g., two pieces with the same `{color}_{type}_{col}` pattern), use a counter suffix — but this doesn't arise in V1.

---

## 2026-05-02 — Server as sole arbiter, client move highlights are approximate

**Decision:** Server validates all moves. Client-side `getClientValidSquares` (in GameScreen.tsx) is used only for highlighting — it's a simplified superset of legal moves (pseudo-legal, no check filtering). The server may reject moves the client highlighted and will accept moves the client didn't highlight (if the client had a bug).

**Reasoning:** Keeps game logic strictly on the server. Client code stays simple. The UX implication (user clicks a highlighted square that the server rejects) is rare and acceptable for V1. The server always sends back the authoritative state on rejection.

---

## 2026-05-02 — Atomic attacker is removed from origin square, not destination

**Decision:** In Atomic captures, the attacker is removed from its original square. The explosion happens at the target (destination) square. The attacker never appears at the destination.

**Reasoning:** The V1 LLD states: "Remove the capturing piece, remove the captured piece, remove all pieces adjacent to the captured square." Treating the target square as the explosion center and removing the attacker from origin avoids the attacker being adjacent to the explosion. The adjacent 8 squares are computed around the target. This is consistent with common Atomic Chess implementations.

---

## 2026-05-02 — Promotion: standard piece choice + upgrade pick are separate UI sections

**Decision:** Promotion modal shows two sections: (1) piece type selector (Q/R/B/N), (2) upgrade card picker. The server's `choose_promotion` event receives both `pieceType` and `upgradeId`.

**Reasoning:** V1 has only Atomic in the upgrade pool, but the UI is structured for the future where each upgrade is meaningfully different. Separating piece type from upgrade choice preserves player agency and avoids conflating the two concepts. The server always requires both fields.

---

## 2026-05-02 — Movement animation: no animation for Atomic captures

**Decision:** Sliding animation is skipped for Atomic captures. The board just instantly reflects the post-explosion state.

**Reasoning:** In Atomic, the attacker disappears rather than settling at the destination. Animating a slide to a square that immediately vanishes is confusing. The heavy screen shake + particles convey the impact without needing a slide animation.

---

## 2026-05-02 — Canvas shake via CSS transform on wrapper div

**Decision:** Screen shake is applied by mutating `wrapperDiv.style.transform` directly in the render loop, not via React state.

**Reasoning:** Shake updates happen every animation frame (60fps). Updating React state that frequently would cause excessive re-renders and performance problems. Direct DOM mutation in the rAF loop is the standard pattern for this kind of high-frequency visual effect.

---

---

## 2026-05-03 — Rook opposition trigger only fires when the rook itself moves

**Decision:** The rook opposition trigger (`rook_opposition`) increments `triggerCount` only when the piece being moved IS the rook (`move.pieceId === piece.id`). Triggering when an *opponent's* rook moves into your rook's file is not detected.

**Reasoning:** In the standard chess starting position, both a-file rooks and both h-file rooks share files. Checking opposition on every move would fire the trigger immediately at game start. Scoping detection to the rook's own move eliminates the false positive cleanly. The downside (missing opponent-driven opposition) is acceptable — the trigger still fires naturally when you open a file and advance your rook.

---

## 2026-05-03 — Trigger detection is a separate module (`triggers.ts`), not in `chess.ts`

**Decision:** All trigger logic lives in `server/src/game/triggers.ts`. The chess engine (`chess.ts`) knows nothing about triggers. Triggers are detected in `state.ts` after every `applyMove` call.

**Reasoning:** Chess engine purity (pure move application + check/checkmate) must be preserved. Triggers are a Hexchess-specific mechanic layered on top of standard chess. Keeping them separate means adding a V3 trigger = adding a config entry to `TRIGGER_CONFIGS` and an effect in `triggers.ts`, no other files change.

---

## 2026-05-03 — Mutations use the same `Upgrade` type and Atomic config as promotion upgrades

**Decision:** `MutationPending.mutations` holds `UpgradeConfig[]` — the same type used for promotion upgrade options. The `ATOMIC_UPGRADE` constant is shared between the promotion pool and the mutation pool.

**Reasoning:** Mutations and promotion upgrades are mechanically identical (both add a specific upgrade to a piece). Sharing the type avoids duplication and means any new upgrade config added for V3 is automatically available to both delivery mechanisms.

---

## 2026-05-03 — Mutation queue is a flat array; multiple triggers in one move are processed sequentially

**Decision:** `GameState.mutationQueue: MutationPending[]` is a FIFO queue. When multiple triggers fire in one move, all are appended. The game stays in `'mutation'` phase until the queue drains, processing one modal at a time.

**Reasoning:** Multiple triggers in a single move is rare but possible (e.g., pawn captures a bishop and advances past halfway). Sequential processing with one modal at a time is simpler than parallel offers and avoids UI complexity. Each trigger gets its full 15-second window.

---

## 2026-05-03 — AI auto-accepts mutations immediately (no timer)

**Decision:** When a mutation fires for the AI's piece, the server calls `applyMutationAccept` immediately without starting the 15-second timer.

**Reasoning:** The AI always accepts Atomic (as designed by the V2 LLD). Running the timer would stall the game for 15 seconds needlessly. The AI's auto-accept also teaches the human player that accepting mutations is the typical choice, demonstrating the feature.

---

## 2026-05-03 — AI promotes to queen + first upgrade automatically (no user input)

**Decision:** When the AI's pawn promotes, the server immediately applies `queen` + `upgradeOptions[0]` without entering the `'promotion'` phase.

**Reasoning:** The promotion modal is a human UX feature. Showing it for the AI (and waiting 30 seconds for auto-select) would make AI games feel broken. Auto-selecting is the logical AI behavior and matches the "AI accepts everything" design.

---

---

## 2026-05-06 — Berserk fires automatically after any capture (not pre-selected)

**Decision:** Berserk triggers automatically after a capture move — the player doesn't pre-arm it. Instead, the game enters ability_pending (berserk) phase if the player has Berserk in their hand and a second capture is available. The card just needs to be in the hand; no explicit activation step before the capture.

**Reasoning:** Pre-arming creates friction ("I must remember to click Berserk before every capture"). Auto-trigger matches the card's flavor ("after capturing... immediately capture again"). The ability_pending phase gives the player a clear 15-second window to choose the second target, with a skip option.

---

## 2026-05-06 — Ability states tick based on who just moved, not turn number

**Decision:** `tickAbilityStates(state, justMoved)` uses the color that just completed a move as the anchor:
- Owning player just moved → decrement `anchorTurnsRemaining`, reset `phantomNoCapture`
- Opponent just moved → decrement `berserkExposedTurns`, reset `surgeExposed`

**Reasoning:** Anchor's "2 turns" means 2 of the owning player's turns — decrement when they move. Surge's exposure lasts "one opponent move" — reset when the opponent moves. This asymmetry is natural and matches the design intent without requiring a separate full-turn counter.

---

## 2026-05-06 — Opponent ability hand is sanitized (card IDs hidden, last used visible)

**Decision:** `sanitizeStateForPlayer` replaces opponent ability card IDs with `'?'` before sending to each player. The opponent's `lastUsedAbilityId` remains visible (so players can see what was last used, which is needed for Echo).

**Reasoning:** Players shouldn't know which specific abilities their opponent holds (hidden information). But `lastUsedAbilityId` must be visible so players can understand Echo plays and react to what the opponent has already revealed.

---

## 2026-05-06 — Long Strike + Atomic: explosion happens at target, attacker stays

**Decision:** When a piece with both Long Strike and Atomic upgrades uses Long Strike, the Atomic explosion triggers at the target square. The attacking piece stays in place (it never moved). This is the "Long Strike + mutated piece" combo from the LLD.

**Reasoning:** Long Strike's positional cost is "no territorial gain." Atomic's normal rule kills the attacker, but since the attacker didn't move, only the target square explodes. The attacker survives the Long Strike even with Atomic. This makes the combo especially powerful and matches the LLD's note about it as an intended discovery.

---

## 2026-05-06 — Phantom destination CAN be a capture, but piece can't capture next turn

**Decision:** Phantom allows the piece to move through a blocker and optionally capture at the destination. The `phantomNoCapture` flag applies to the FOLLOWING turn only, not the Phantom move itself.

**Reasoning:** If Phantom couldn't capture at the destination at all, it would only be useful for repositioning. Allowing capture at the destination (after passing through the blocker) makes it a more interesting tactical tool — at the cost of being defensively weak next turn.

---

## 2026-05-06 — No client-side move validation for promotion eligibility

**Decision:** The client accepts all `make_move` submissions to the promotion square. The server is responsible for detecting that the move triggers promotion and entering the promotion phase.

**Reasoning:** Client-side detection of promotion (pawn reaches back rank) is redundant given the server-authoritative model. Keeping the rule in one place (server) avoids sync bugs.
