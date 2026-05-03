// Single source of truth for all shared types across client and server.

export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export type Color = 'white' | 'black';

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
  hasMoved: boolean; // tracks castling eligibility
}

export type GamePhase = 'waiting' | 'active' | 'promotion' | 'complete';

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
  byWhite: Piece[]; // pieces captured by white player (i.e., black pieces)
  byBlack: Piece[]; // pieces captured by black player (i.e., white pieces)
}

export interface PromotionPending {
  pieceId: string;
  position: Position;
  upgradeOptions: UpgradeConfig[];
}

export interface GameState {
  board: (string | null)[][]; // board[row][col] = pieceId | null
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
}

// ---- Socket event payloads: Client → Server ----

export interface JoinRoomPayload {
  roomId: string;
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

// ---- Socket event payloads: Server → Client ----

export interface RoomCreatedPayload {
  roomId: string;
  shareUrl: string;
}

export interface GameStartPayload {
  gameState: GameState;
  yourColor: Color;
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
