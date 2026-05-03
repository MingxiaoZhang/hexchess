import { Color, GameState, Move, PieceType, Position, UpgradeConfig } from '@hexchess/shared';
import { GAME_CONFIG } from '../config';
import { applyMove, applyPromotion, getValidMoves, isCheckmate, isStalemate } from './chess';
import { drawUpgradeOptions } from './upgrades';

export interface MoveOutcome {
  newState: GameState;
  move: Move;
  atomic: boolean;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
  promotionRequired: boolean;
  upgradeOptions: UpgradeConfig[];
}

// Validates and applies a player move. Returns the outcome or null if the move is illegal.
export function handleMove(
  state: GameState,
  pieceId: string,
  to: Position,
  actingColor: Color
): MoveOutcome | null {
  if (state.phase !== 'active') return null;
  if (state.currentTurn !== actingColor) return null;

  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;

  const validMoves = getValidMoves(state, pieceId);
  const isValid = validMoves.some(m => m.row === to.row && m.col === to.col);
  if (!isValid) return null;

  const { newState, move, promotionNeeded } = applyMove(state, pieceId, to);

  if (promotionNeeded) {
    const upgradeOptions = drawUpgradeOptions(GAME_CONFIG, GAME_CONFIG.promotionUpgradeCount);
    const pausedState: GameState = {
      ...newState,
      phase: 'promotion',
      promotionPending: {
        pieceId,
        position: to,
        upgradeOptions,
      },
    };
    return {
      newState: pausedState,
      move,
      atomic: move.atomic ?? false,
      gameOver: false,
      winner: null,
      promotionRequired: true,
      upgradeOptions,
    };
  }

  // Check game-over conditions for the player whose turn it now is
  const nextColor = newState.currentTurn;
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;

  if (isCheckmate(newState, nextColor)) {
    gameOver = true;
    winner = actingColor;
    reason = 'checkmate';
  } else if (isStalemate(newState, nextColor)) {
    gameOver = true;
    winner = null;
    reason = 'stalemate';
  }

  const finalState: GameState = gameOver
    ? { ...newState, phase: 'complete', winner, gameOverReason: reason }
    : { ...newState, phase: 'active' };

  return {
    newState: finalState,
    move,
    atomic: move.atomic ?? false,
    gameOver,
    winner,
    reason,
    promotionRequired: false,
    upgradeOptions: [],
  };
}

export interface PromotionOutcome {
  newState: GameState;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
}

// Applies the player's promotion choice (piece type + upgrade selection).
export function handlePromotion(
  state: GameState,
  pieceId: string,
  newType: PieceType,
  upgradeId: string | null,
  actingColor: Color
): PromotionOutcome | null {
  if (state.phase !== 'promotion') return null;
  if (!state.promotionPending || state.promotionPending.pieceId !== pieceId) return null;

  // Verify the chosen piece type is valid
  const validTypes: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
  if (!validTypes.includes(newType)) return null;

  // Resolve the upgrade (must be from the offered options)
  const upgradeConfig = upgradeId
    ? state.promotionPending.upgradeOptions.find(u => u.id === upgradeId) ?? null
    : null;

  let promoted = applyPromotion(state, pieceId, newType, upgradeConfig);

  // Resume the game
  promoted = {
    ...promoted,
    phase: 'active',
    promotionPending: undefined,
    // currentTurn was already advanced by applyMove before promotion was triggered
  };

  const nextColor = promoted.currentTurn;
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;

  if (isCheckmate(promoted, nextColor)) {
    gameOver = true;
    winner = actingColor;
    reason = 'checkmate';
  } else if (isStalemate(promoted, nextColor)) {
    gameOver = true;
    winner = null;
    reason = 'stalemate';
  }

  const finalState: GameState = gameOver
    ? { ...promoted, phase: 'complete', winner, gameOverReason: reason }
    : promoted;

  return { newState: finalState, gameOver, winner, reason };
}

// Auto-selects a promotion (queen + first upgrade) when the timer expires.
export function handlePromotionTimeout(
  state: GameState,
  actingColor: Color
): PromotionOutcome | null {
  if (!state.promotionPending) return null;
  const { pieceId, upgradeOptions } = state.promotionPending;
  const upgradeId = upgradeOptions[0]?.id ?? null;
  return handlePromotion(state, pieceId, 'queen', upgradeId, actingColor);
}

// Marks the game as over due to timeout. The player who ran out of time loses.
export function applyTimeout(state: GameState, timedOutColor: Color): GameState {
  const winner: Color = timedOutColor === 'white' ? 'black' : 'white';
  return {
    ...state,
    phase: 'complete',
    winner,
    gameOverReason: 'timeout',
  };
}

export function applyForfeit(state: GameState, forfeitColor: Color): GameState {
  const winner: Color = forfeitColor === 'white' ? 'black' : 'white';
  return { ...state, phase: 'complete', winner, gameOverReason: 'forfeit' };
}

export function applyDisconnectWin(state: GameState, disconnectedColor: Color): GameState {
  const winner: Color = disconnectedColor === 'white' ? 'black' : 'white';
  return { ...state, phase: 'complete', winner, gameOverReason: 'disconnect' };
}

// Strips server-private information before sending state to a specific player.
// In V1 there's no hidden info, but this is the right place for it.
export function sanitizeStateForPlayer(state: GameState, _playerColor: Color): GameState {
  return state;
}

