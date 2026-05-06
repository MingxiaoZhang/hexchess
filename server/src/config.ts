import { AbilityConfig, AbilityId, GameConfig, UpgradeConfig } from '@hexchess/shared';

// ---- V1/V2: mutation upgrades ----

export const ATOMIC_UPGRADE: UpgradeConfig = {
  id: 'atomic',
  name: 'Atomic',
  description: 'On capture: destroys the capturing piece, captured piece, and all adjacent non-king pieces.',
  maxPerPiece: 1,
};

export const MUTATION_POOL: UpgradeConfig[] = [ATOMIC_UPGRADE];

// ---- V3: ability cards ----

export const ABILITY_CONFIGS: Record<AbilityId, AbilityConfig> = {
  berserk: {
    id: 'berserk',
    name: 'Berserk',
    description: 'After capturing a piece, immediately capture again if a valid target is in range.',
    positionalCost: 'After the second capture, the piece is exposed for one opponent move.',
    tags: ['aggressive'],
    maxUses: null, // unlimited
  },
  long_strike: {
    id: 'long_strike',
    name: 'Long Strike',
    description: 'Capture an enemy piece from a distance. Your piece stays in place.',
    positionalCost: 'No territorial gain — you take the piece but gain no position.',
    tags: ['aggressive'],
    maxUses: 1,
  },
  phantom: {
    id: 'phantom',
    name: 'Phantom',
    description: 'Move through an occupied square without capturing it.',
    positionalCost: 'The piece cannot capture on its next turn.',
    tags: ['trickster'],
    maxUses: 1,
  },
  anchor: {
    id: 'anchor',
    name: 'Anchor',
    description: 'Your piece on the selected square cannot be captured for 2 turns.',
    positionalCost: 'The anchored piece cannot move for those 2 turns.',
    tags: ['defensive'],
    maxUses: null, // unlimited
  },
  echo: {
    id: 'echo',
    name: 'Echo',
    description: "Copy the last ability your opponent used and use it now.",
    positionalCost: 'Costs your move for that turn.',
    tags: ['trickster'],
    maxUses: 1,
  },
  surge: {
    id: 'surge',
    name: 'Surge',
    description: 'A pawn moves up to 3 squares forward this turn.',
    positionalCost: 'The pawn is exposed — any piece can capture it next turn.',
    tags: ['aggressive', 'positional'],
    maxUses: null, // unlimited
  },
};

export const ABILITY_POOL: AbilityId[] = Object.keys(ABILITY_CONFIGS) as AbilityId[];

export const GAME_CONFIG: GameConfig = {
  moveTimerSeconds: 60,
  upgradePool: [ATOMIC_UPGRADE],
  promotionUpgradeCount: 3,
  reconnectionWindowMs: 30_000,
  mutationTimerSeconds: 15,
  abilityHandSize: 3,            // each player draws 3 abilities at game start
  abilityPendingTimerSeconds: 15, // time to complete Berserk second capture or Echo
};
