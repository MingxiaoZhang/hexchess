import { GameConfig, UpgradeConfig } from '@hexchess/shared';

export const ATOMIC_UPGRADE: UpgradeConfig = {
  id: 'atomic',
  name: 'Atomic',
  description:
    'On capture: destroys the capturing piece, captured piece, and all adjacent non-king pieces.',
  maxPerPiece: 1,
};

// V2: all available mutations (V2 has only Atomic)
export const MUTATION_POOL: UpgradeConfig[] = [ATOMIC_UPGRADE];

export const GAME_CONFIG: GameConfig = {
  moveTimerSeconds: 60,
  upgradePool: [ATOMIC_UPGRADE],   // available via promotion upgrade pick
  promotionUpgradeCount: 3,
  reconnectionWindowMs: 30_000,
  mutationTimerSeconds: 15,        // V2: time to accept/decline a mutation offer
};
