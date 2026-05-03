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

## 2026-05-02 — No client-side move validation for promotion eligibility

**Decision:** The client accepts all `make_move` submissions to the promotion square. The server is responsible for detecting that the move triggers promotion and entering the promotion phase.

**Reasoning:** Client-side detection of promotion (pawn reaches back rank) is redundant given the server-authoritative model. Keeping the rule in one place (server) avoids sync bugs.
