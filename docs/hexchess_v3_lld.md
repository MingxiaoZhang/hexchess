# Hexchess — V3 Low Level Design

## Status
Placeholder. Scope to be confirmed after V2 playtesting. Do not build until V2 design questions are answered.

---

## Goal
Introduce the ability card system and validate whether trigger + ability combos create natural discovery moments. This is where Hexchess starts feeling like a genuinely new game rather than chess with mutations.

## What V3 Is
- Everything in V1 and V2, plus:
- Full ability pool (6 abilities)
- Random draw of 3 abilities per player at game start
- Trigger + ability combo space opens up naturally
- AI opponent updated to use abilities

## What V3 Is NOT
- No archetypes or factions yet — still random draws
- No additional mutations beyond Atomic unless V2 feedback demands it
- No bounty system
- No board chaos events
- No fog of war

---

## Core V3 Feature: Ability System

### Design Rules
- Abilities are rune-scale — small enhancements, not game breaking
- King capture always remains the win condition
- Every ability has a positional cost or constraint, not a numerical one
- Balance comes from positioning like chess itself

### Ability Pool (6 abilities)

**Berserk:**
- Effect — a piece that captures another piece can immediately capture again if a valid target is in range
- Positional cost — after the second capture the piece is exposed, cannot be protected for one full turn
- Key combo — use on a knight with aggression trigger (2 captures = mutation). Can trigger mutation in a single turn.
- Tags — aggressive

**Long Strike:**
- Effect — once per game, capture an enemy piece from a distance without moving to its square. Your piece stays in place.
- Positional cost — no positional gain. You take the piece but gain no territory.
- Tags — aggressive

**Phantom:**
- Effect — once per game, move through an occupied square without capturing it
- Positional cost — the piece cannot capture on its next turn
- Tags — trickster

**Anchor:**
- Effect — declare a square as anchored. Your piece on that square cannot be captured for 2 turns.
- Positional cost — the anchored piece cannot move for those 2 turns
- Key combo — anchor a piece that is close to its trigger. Forces opponent to wait while it completes.
- Tags — defensive

**Echo:**
- Effect — once per game, copy the last ability your opponent used
- Positional cost — costs your move for that turn
- Tags — trickster

**Surge:**
- Effect — a pawn can move up to 3 squares forward this turn
- Positional cost — the pawn is exposed after surging, any piece can capture it next turn
- Key combo — use on a pawn close to rank 5. Fires the pawn trigger in one move instead of multiple turns.
- Tags — aggressive, positional

### Draw System
- At game start each player is dealt 3 abilities randomly from the pool
- Fully random in V3 — no archetype weighting yet
- Both players see their own 3 abilities, not opponent's
- Abilities shown as cards outside the board, always visible
- Fixed for the match — no drawing during game
- Each ability shows uses remaining

### Intended Combo Discovery Moments
These combos exist but are never explained to the player. They should be discovered through play:

- Berserk + Knight trigger — mutate a knight in one turn
- Surge + Pawn trigger — fire pawn trigger immediately instead of slowly advancing
- Anchor + any trigger — protect a piece while it completes its trigger condition
- Echo + opponent's Berserk — steal an aggressive ability and use it defensively
- Long Strike + mutated piece — trigger atomic explosion from a distance

---

## AI Opponent Updates for V3

### Updated Behavior
- AI uses abilities when it recognizes a valid opportunity
- AI specifically attempts known combos — e.g. plays Berserk on a knight close to its trigger
- This teaches players combos exist by demonstrating them

---

## Key Design Questions V3 Must Answer
After playtesting V3, answer these before designing V4:

- Did players discover combos naturally without being told?
- Did abilities feel like enhancements to chess or did they overshadow it?
- Were positional costs understood intuitively?
- Which abilities were most used, least used, most complained about?
- Did 3 fixed abilities feel like enough variety?
- Is the game ready for archetypes and weighted draws?
- Are there any abilities that feel broken or useless?

---

## V2 Feedback Template
Fill this in after playtesting V2 before starting V3 build:

**Did mutations arrive early enough:**

**Which triggers fired most / least:**

**Did players play around opponent triggers:**

**Was Atomic enough as the only mutation:**

**AI feedback:**

**Anything to fix in V2 before starting V3:**

---

## Backlog — Deferred to V4+
- Loose archetypes / weighted draws based on playstyle preference
- Additional mutations beyond Atomic
- Bounty system
- Board chaos events (board flip, piece swap, row shift)
- Fog of war — rewards chess memory as a hidden skill
- Piece combo structures (pawn walls, connected piece formations)
- Ranked PvP with archetype mirror matchmaking
- Timer manipulation abilities
- Sound effects
- Lore and faction identity