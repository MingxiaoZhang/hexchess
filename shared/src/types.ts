// Single source of truth for all shared types across client and server.

export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Color = 'white' | 'black';

// V2: mutation trigger types
export type TriggerType =
  | 'pawn_advance'
  | 'knight_captures'
  | 'bishop_revenge'
  | 'rook_opposition'
  | 'queen_checks';

// V3: ability identifiers
export type AbilityId = 'berserk' | 'long_strike' | 'phantom' | 'anchor' | 'echo' | 'surge';

export interface Position {
  row: number; // 0 = rank 8 (black back rank), 7 = rank 1 (white back rank)
  col: number; // 0 = file a, 7 = file h
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  usesRemaining: number | null;
}

export interface Piece {
  id: string;
  type: PieceType;
  color: Color;
  position: Position;
  upgrades: Upgrade[];
  hasMoved: boolean;
  // V2: trigger tracking
  triggerCount: number;
  triggered: boolean;
  // V3: ability effect state
  anchorTurnsRemaining: number;  // 0 = not anchored; piece can't move or be captured while >0
  phantomNoCapture: boolean;     // can't capture this turn (used Phantom last turn)
  berserkExposedTurns: number;  // 0 = normal; can't be Anchored while >0; expires after 1 opponent move
  surgeExposed: boolean;         // any enemy can capture this pawn regardless of pins; expires after 1 opponent move
}

export type GamePhase =
  | 'waiting'
  | 'active'
  | 'promotion'
  | 'mutation'
  | 'ability_pending'  // V3: waiting for player to complete a multi-step ability (Berserk, Echo)
  | 'complete';

export interface Move {
  pieceId: string;
  from: Position;
  to: Position;
  capturedPieceId?: string;
  upgradeUsed?: string;
  isEnPassant?: boolean;
  isCastle?: boolean;
  isPromotion?: boolean;
  promotionType?: PieceType;
  atomic?: boolean;
  atomicDestroyedIds?: string[];
}

export interface TimerConfig {
  moveTimerSeconds: number;
}

export interface CapturedPieces {
  byWhite: Piece[];
  byBlack: Piece[];
}

export interface PromotionPending {
  pieceId: string;
  position: Position;
  upgradeOptions: UpgradeConfig[];
}

export interface MutationPending {
  pieceId: string;
  pieceType: PieceType;
  triggerType: TriggerType;
  ownerColor: Color;
  mutations: UpgradeConfig[];
}

// V3: per-player ability hand
export interface AbilityCard {
  id: AbilityId;
  usesRemaining: number | null; // null = unlimited
}

export interface PlayerAbilities {
  hand: AbilityCard[];
  lastUsedAbilityId?: AbilityId; // tracked for Echo
  lastUsedTargetPos?: Position;  // tracked for Echo (optional target)
  lastUsedPieceId?: string;      // tracked for Echo
}

// V3: pending ability state (game paused while player completes multi-step ability)
export type AbilityPending =
  | { type: 'berserk'; pieceId: string; pieceColor: Color; validTargets: Position[] }
  | { type: 'echo'; copiedAbilityId: AbilityId; pieceColor: Color };

// V3: display config for ability cards (shared between client and server)
export interface AbilityConfig {
  id: AbilityId;
  name: string;
  description: string;
  positionalCost: string;
  tags: string[];
  maxUses: number | null; // null = unlimited
}

export interface GameState {
  board: (string | null)[][];
  pieces: Record<string, Piece>;
  currentTurn: Color;
  phase: GamePhase;
  moveNumber: number;
  timerConfig: TimerConfig;
  enPassantTarget: Position | null;
  halfMoveClock: number;
  capturedPieces: CapturedPieces;
  winner?: Color | null;
  gameOverReason?: 'checkmate' | 'stalemate' | 'timeout' | 'forfeit' | 'disconnect';
  promotionPending?: PromotionPending;
  mutationQueue: MutationPending[];
  // V3: ability hands (each player only sees their own hand; opponent's is sanitized)
  playerAbilities: Record<Color, PlayerAbilities>;
  abilityPending?: AbilityPending;
  lastMove?: Move;
}

export interface UpgradeConfig {
  id: string;
  name: string;
  description: string;
  maxPerPiece: number;
}

export interface RoomConfig {
  moveTimerSeconds: number;
}

export interface GameConfig {
  moveTimerSeconds: number;
  upgradePool: UpgradeConfig[];
  promotionUpgradeCount: number;
  reconnectionWindowMs: number;
  mutationTimerSeconds: number;
  abilityHandSize: number;       // V3: how many ability cards each player draws
  abilityPendingTimerSeconds: number; // V3: time for Berserk second capture / Echo
}

// ---- Socket event payloads: Client → Server ----

export interface CreateRoomPayload {
  vsAI?: boolean;
}

export interface JoinRoomPayload {
  roomId: string;
  reconnectToken?: string;
}

export interface MakeMovePayload {
  roomId: string;
  pieceId: string;
  from: Position;
  to: Position;
}

export interface UseUpgradePayload {
  roomId: string;
  pieceId: string;
  upgradeId: string;
  targetPosition?: Position;
}

export interface ChoosePromotionPayload {
  roomId: string;
  pieceType: PieceType;
  upgradeId: string;
}

export interface AcceptMutationPayload {
  roomId: string;
  pieceId: string;
  mutationId: string;
}

export interface DeclineMutationPayload {
  roomId: string;
  pieceId: string;
}

// V3: use an ability card
export interface UseAbilityPayload {
  roomId: string;
  abilityId: AbilityId;
  pieceId?: string;    // source piece (most abilities)
  targetPos?: Position; // target square (abilities with a destination)
}

// V3: skip/decline the current ability_pending (e.g. decline Berserk second capture)
export interface DeclineAbilityPendingPayload {
  roomId: string;
}

// ---- Socket event payloads: Server → Client ----

export interface RoomCreatedPayload {
  roomId: string;
  shareUrl: string;
  vsAI: boolean;
  reconnectToken: string;
  yourColor: Color;
}

export interface GameStartPayload {
  gameState: GameState;
  yourColor: Color;
  vsAI: boolean;
  reconnectToken: string;
}

export interface MoveResultPayload {
  gameState: GameState;
  move: Move;
  atomic: boolean;
}

export interface PromotionRequiredPayload {
  pieceId: string;
  upgradeOptions: UpgradeConfig[];
}

export interface MutationAvailablePayload {
  pieceId: string;
  pieceType: PieceType;
  triggerType: TriggerType;
  mutations: UpgradeConfig[];
}

export interface MutationOutcomePayload {
  pieceId: string;
  pieceType: PieceType;
  accepted: boolean;
  mutationId?: string;
  mutationName?: string;
  ownerColor: Color;
}

// V3: ability result sent to both players
export interface AbilityResultPayload {
  gameState: GameState;
  abilityId: AbilityId;
  ownerColor: Color;
  pieceId?: string;
  targetPos?: Position;
}

export interface TimerUpdatePayload {
  secondsRemaining: number;
  color: Color;
}

export interface GameOverPayload {
  winner: Color | null;
  reason: 'checkmate' | 'stalemate' | 'timeout' | 'forfeit' | 'disconnect';
}

export interface ErrorPayload {
  message: string;
}
