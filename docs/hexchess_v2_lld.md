# Hexchess — V2 Low Level Design

## Status
Defined. Scope locked based on V1 playtesting decisions. Do not expand until V2 is validated.

---

## Goal
Validate whether piece triggers and mutations feel fun, create natural discovery, and make Hexchess feel meaningfully different from regular chess earlier in the game — not just in the endgame.

## What V2 Is
- Everything in V1, plus:
- Per-piece mutation triggers — each piece type has its own natural trigger
- Player chooses mutation when trigger fires — not automatic
- Atomic is the only mutation available in V2
- Pawn promotion still exists but is no longer the only path to mutation
- Basic AI opponent for solo testing

## What V2 Is NOT
- No ability card system yet
- No archetypes or factions
- No bounty system
- No board chaos events
- No fog of war

---

## Core V2 Feature: Per-Piece Mutation Triggers

### Design Rules
- Every piece type has one trigger that fits its natural character
- Triggers should be achievable in the mid-game, not just endgame
- When a trigger fires, a modal appears and the player chooses whether to accept Atomic
- The choice is meaningful — Atomic causes the piece to die on capture, which is not always desirable
- Pawn promotion remains as an additional trigger for pawns

### Trigger Definitions Per Piece

**Pawn:**
- Trigger — advances past the halfway line (rank 5 for white, rank 4 for black)
- Why — rewards aggressive pawn play, creates early mutation opportunities
- Also triggers on promotion as before

**Knight:**
- Trigger — captures 2 pieces total across the game
- Why — fits the knight's aggressive tactical nature. Combos naturally with Berserk in V3.

**Bishop:**
- Trigger — one bishop is captured
- Effect — the surviving bishop's trigger fires immediately as a revenge mechanic
- Why — bishops are linked as a pair. One's death empowers the other. Creates a dilemma for the opponent — trade a bishop and empower its partner, or leave it and deal with the pair.
- Strategic implication — player may deliberately sacrifice a bishop to trigger the mutation on the surviving one

**Rook:**
- Trigger — your rook and opponent's rook are on the same file (direct opposition)
- Why — natural chess moment, happens organically, creates standoff tension before one captures

**Queen:**
- Trigger — delivers check twice across the game
- Why — the queen is already powerful so her trigger should be harder to earn. Two checks requires deliberate sustained aggression, not just one lucky move. Still achievable mid-game.

**King:**
- No mutation trigger ever
- The king is always the objective, never a weapon

### Mutation Modal
When any trigger fires:
- A modal appears for the triggering player only
- Shows available mutations to choose from
- V2 has one mutation: Atomic
- Player accepts or declines
- 15 second timer — auto-declines if no selection made (prevents stalling)
- Both players notified of the outcome — "Opponent's knight mutated" or "Opponent declined mutation"

### Mutation — Atomic (only mutation in V2)
- Any capture made by this piece triggers an atomic explosion
- Destroys all pieces adjacent to the captured square
- The attacking piece also dies in the explosion
- Visual — heavy screen shake + explosion particles + red aura on piece before it fires

---

## Core V2 Feature: Basic AI Opponent

### Purpose
- Allows solo playtesting without needing a second human player
- AI actively pursues piece triggers so player can see mutations happen during play
- Not designed to be a strong chess opponent — just functional enough to create real game situations

### AI Behavior
- Plays legal chess moves, prioritizes captures when available
- Actively pursues triggers — moves knight toward captures, advances pawns aggressively, seeks rook opposition
- Accepts Atomic mutation when offered
- Does not resign, plays until checkmate or timeout
- Difficulty: easy only for V2

### Why This Matters
The AI demonstrating trigger pursuit teaches players that triggers exist and are worth chasing — without a tutorial.

---

## Key Design Questions V2 Must Answer
After playtesting V2, answer these before designing V3:

- Did mutations arrive early enough to feel impactful?
- Did players understand triggers intuitively or did they need explaining?
- Did players start playing around opponent triggers — trying to prevent them?
- Which triggers fired most often, least often?
- Was the accept/decline choice meaningful or did players always accept?
- Did the bishop revenge mechanic create interesting dilemmas?
- Did Atomic feel powerful enough as the only mutation?
- Did the AI successfully demonstrate trigger pursuit?
- Are players ready for the ability system on top of this?

---

## V1 Feedback Template
Fill this in after playtesting V1 before starting V2 build:

**What felt most fun:**

**What felt confusing:**

**What felt missing:**

**Atomic upgrade feedback:**

**Timer feedback:**

**Visual/effects feedback:**

**Anything to fix in V1 before starting V2:**

---

## Backlog — Deferred to V3+
- Ability card system (Berserk, Long Strike, Phantom, Anchor, Echo, Surge)
- Trigger + ability combos (e.g. Berserk on knight accelerates aggression trigger)
- Additional mutations beyond Atomic
- Bishop trigger improvements if revenge mechanic needs tuning
- Archetypes / weighted ability draws
- Bounty system
- Board chaos events
- Fog of war
- Ranked mode
- Sound effects
- Lore and faction identity