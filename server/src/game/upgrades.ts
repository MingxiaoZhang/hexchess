import { GameConfig, UpgradeConfig } from '@hexchess/shared';

// Returns `count` upgrade options drawn from the upgrade pool (with replacement).
// In V1, the pool only contains Atomic, so all options are the same card.
// The UI still shows 3 cards so the promotion modal renders correctly.
export function drawUpgradeOptions(config: GameConfig, count: number): UpgradeConfig[] {
  const pool = config.upgradePool;
  if (pool.length === 0) return [];
  return Array.from({ length: count }, (_, i) => pool[i % pool.length]);
}
