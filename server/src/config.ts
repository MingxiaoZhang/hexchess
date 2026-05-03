import { GameConfig, UpgradeConfig } from '@hexchess/shared';

export const ATOMIC_UPGRADE: UpgradeConfig = {
  id: 'atomic',
  name: 'Atomic',
  description:
    'On capture: destroys the capturing piece, captured piece, and all adjacent non-king pieces.',
  maxPerPiece: 1,
};

export const GAME_CONFIG: GameConfig = {
  moveTimerSeconds: 60,
  upgradePool: [ATOMIC_UPGRADE], // V1: only Atomic in the pool
  promotionUpgradeCount: 3,
  reconnectionWindowMs: 30_000,
};
