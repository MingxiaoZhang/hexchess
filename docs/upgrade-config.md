# Hexchess — Upgrade Config

All upgrades defined in `server/src/config.ts` as `UpgradeConfig` entries. Adding a new upgrade = adding an entry to `GAME_CONFIG.upgradePool`. No game logic files need modification.

## V1 Upgrade Pool

### Atomic

| Field | Value |
|---|---|
| ID | `atomic` |
| Max per piece | 1 |
| Uses | Unlimited (fires every capture) |
| How earned | Pawn promotion (offered as upgrade pick) |

**Effect:** On capture:
1. Remove the captured piece from the target square
2. Remove all pieces adjacent to the target square (8 surrounding squares), **except kings**
3. Remove the capturing piece itself (from its original square)
4. Check for checkmate/game-over resulting from the explosion

**Visual:** Heavy screen shake (15px amplitude, 500ms) + red particle burst (30 particles) at the explosion center.

**Display:** Piece shows a red aura/glow (animated pulse) when it carries Atomic.

## Adding Future Upgrades

Add to `GAME_CONFIG.upgradePool` in `config.ts`:

```typescript
{
  id: 'haste',
  name: 'Haste',
  description: 'This piece may move twice in one turn, once per game.',
  maxPerPiece: 1,
}
```

Wire the effect in `game/state.ts` by checking `piece.upgrades.some(u => u.id === 'haste')` in `handleMove`. No changes needed to chess.ts move generation or socket.ts.
