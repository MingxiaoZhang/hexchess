# Hexchess — V2 Low Level Design

## Status
Placeholder. V2 scope will be defined after V1 playtesting and feedback.

---

## Purpose of This Document
After V1 is played by real users, this document will be updated with:
- What mechanics felt fun and should be expanded
- What felt confusing or broken and needs fixing
- What new features to add in V2
- Any architectural changes needed based on V1 learnings

---

## Candidate Features for V2
These are features from the high level doc that are strong candidates for V2, pending V1 feedback. Final scope TBD.

### Bounty System
Randomly assign secret bounty upgrades to 3-4 pieces per side at game start. Capturing a bounty piece grants its upgrade to the attacker. Neither player knows which pieces have bounties until captured.

Key questions to answer after V1:
- Does the upgrade system feel rewarding enough to add a second delivery mechanism?
- Is Atomic fun enough that players want more upgrade variety?

### Additional Upgrades
Expand the upgrade pool beyond Atomic. Candidates from high level doc:
- Haste — move twice in one turn, once per game
- Blink — swap with any friendly piece, once per game
- Phase Shift — bishop switches diagonal color, once per game
- Extended Range — +2 squares of movement

Key questions to answer after V1:
- Did players understand Atomic intuitively or was it confusing?
- How quickly did players adapt their strategy around the upgrade?

### Board Chaos Events
Generate 2-3 events at game start that trigger at random move numbers.

Candidate events:
- Board Flip — all positions mirror 180 degrees
- Random Piece Swap — two random pieces swap positions
- Row Shift — entire rank slides one square, edge pieces removed

Key questions to answer after V1:
- Did the game feel chaotic enough with just Atomic, or do players want more unpredictability?
- Would board events feel fun or frustrating?

### Sound Effects
- Capture sounds scaled by piece value (thud, crack, silence for pawns)
- Atomic explosion sound
- Promotion fanfare
- Timer warning sound when low on time

### Timer Manipulation
Expand timer system based on the configurable foundation built in V1:
- Capturing a piece adds time to your clock
- Using an upgrade costs time
- Special upgrade: steal opponent's remaining move time

---

## V1 Feedback Template
Use this after playtesting V1 to fill in V2 scope:

**What felt most fun:**


**What felt confusing:**


**What felt missing:**


**Atomic upgrade feedback:**


**Timer feedback:**


**Visual/effects feedback:**


**V2 priority features based on feedback:**
1.
2.
3.