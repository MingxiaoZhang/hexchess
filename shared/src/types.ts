// Single source of truth for all shared types across client and server.

export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Color = 'white' | 'black';

// Which gameplay event unlocks a mutation offer for this piece.
export type TriggerType =
  | 'pawn_advance'      // pawn crosses the halfway line
  | 'knight_captures'   // knight accumulates 2 captures
  | 'bishop_revenge'    // surviving bishop when its partner is captured
  | 'rook_opposition'   // rook shares a file with an opponent rook
  | 'queen_checks';     // queen delivers check twice

export interface Position {
  row: number; // 0 = rank 8 (black back rank), 7 = rank 1 (white back rank)
  col: number; // 0 = file a, 7 = file h
}

export interface Upgrade {
  id: string;
  name: string;
  description: string;
  usesRemaining: number | null; // null = unlimited
}

export interface Piece {
  id: string;
  type: PieceType;
  color: Color;
  position: Position;
  upgrades: Upgrade[];
  hasMoved: boolean;
  // V2: trigger tracking
  triggerCount: number;  // progress toward this piece's trigger condition
  triggered: boolean;    // true once the trigger has fired (prevents re-triggering)
}

export type GamePhase = 'waiting' | 'active' | 'promotion' | 'mutation' | 'complete';

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

// One entry in the mutation queue — one piece that has earned a mutation offer.
export interface MutationPending {
  pieceId: string;
  pieceType: PieceType;
  triggerType: TriggerType;
  ownerColor: Color;
  mutations: UpgradeConfig[]; // options shown in modal (V2: only Atomic)
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
  // V2: pending mutation queue — game is paused while non-empty
  mutationQueue: MutationPending[];
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
  mutationTimerSeconds: number; // V2: how long player has to accept/decline mutation
}

// ---- Socket event payloads: Client → Server ----

export interface CreateRoomPayload {
  vsAI?: boolean;
}

export interface JoinRoomPayload {
  roomId: string;
  reconnectToken?: string; // provided when rejoining after a page refresh
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

// ---- Socket event payloads: Server → Client ----

export interface RoomCreatedPayload {
  roomId: string;
  shareUrl: string;
  vsAI: boolean;
  reconnectToken: string;
  yourColor: Color; // set immediately so Tab 1 doesn't depend on game_start for role
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

// Sent ONLY to the owning player when their piece's trigger fires.
export interface MutationAvailablePayload {
  pieceId: string;
  pieceType: PieceType;
  triggerType: TriggerType;
  mutations: UpgradeConfig[];
}

// Sent to BOTH players — winner's name, etc. (the opponent sees a notification)
export interface MutationOutcomePayload {
  pieceId: string;
  pieceType: PieceType;
  accepted: boolean;
  mutationId?: string;
  mutationName?: string;
  ownerColor: Color;
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
