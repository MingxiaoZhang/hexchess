import { Color, GameState, Move, MutationPending, PieceType, Position, UpgradeConfig } from '@hexchess/shared';
import { GAME_CONFIG } from '../config';
import { applyMove, applyPromotion, getValidMoves, isCheckmate, isStalemate } from './chess';
import { detectAndUpdateTriggers } from './triggers';
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
  newTriggers: MutationPending[];
}

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
  if (!validMoves.some(m => m.row === to.row && m.col === to.col)) return null;

  const { newState: afterMove, move, promotionNeeded } = applyMove(state, pieceId, to);

  // Detect triggers (runs on every move regardless of promotion)
  const { state: afterTriggers, newTriggers } = detectAndUpdateTriggers(state, afterMove, move);

  if (promotionNeeded) {
    const upgradeOptions = drawUpgradeOptions(GAME_CONFIG, GAME_CONFIG.promotionUpgradeCount);
    const pendingQueue = [...afterTriggers.mutationQueue, ...newTriggers];
    const pausedState: GameState = {
      ...afterTriggers,
      phase: 'promotion',
      promotionPending: { pieceId, position: to, upgradeOptions },
      mutationQueue: pendingQueue, // will be processed after promotion resolves
    };
    return {
      newState: pausedState,
      move,
      atomic: move.atomic ?? false,
      gameOver: false,
      winner: null,
      promotionRequired: true,
      upgradeOptions,
      newTriggers,
    };
  }

  // Merge new triggers into queue
  const fullQueue = [...afterTriggers.mutationQueue, ...newTriggers];

  if (fullQueue.length > 0) {
    const mutationState: GameState = {
      ...afterTriggers,
      phase: 'mutation',
      mutationQueue: fullQueue,
    };
    return {
      newState: mutationState,
      move,
      atomic: move.atomic ?? false,
      gameOver: false,
      winner: null,
      promotionRequired: false,
      upgradeOptions: [],
      newTriggers,
    };
  }

  // No triggers — check game over for next player
  return resolveGameOver(afterTriggers, move, actingColor, move.atomic ?? false, []);
}

// ---- Mutation handling ----

export interface MutationOutcome {
  newState: GameState;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
  nextMutation: MutationPending | null;
}

export function handleMutationAccept(
  state: GameState,
  pieceId: string,
  mutationId: string,
  actingColor: Color
): MutationOutcome | null {
  if (state.phase !== 'mutation') return null;
  const current = state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId || current.ownerColor !== actingColor) return null;

  const mutationConfig = current.mutations.find(m => m.id === mutationId);
  if (!mutationConfig) return null;

  // Apply the mutation (add as upgrade to the piece)
  const piece = state.pieces[pieceId];
  if (!piece) return null;

  const newUpgrade = {
    id: mutationConfig.id,
    name: mutationConfig.name,
    description: mutationConfig.description,
    usesRemaining: null as null,
  };
  const updatedPieces = {
    ...state.pieces,
    [pieceId]: { ...piece, upgrades: [...piece.upgrades, newUpgrade] },
  };

  const remainingQueue = state.mutationQueue.slice(1);
  return resolveAfterMutation({ ...state, pieces: updatedPieces, mutationQueue: remainingQueue });
}

export function handleMutationDecline(
  state: GameState,
  pieceId: string,
  actingColor: Color
): MutationOutcome | null {
  if (state.phase !== 'mutation') return null;
  const current = state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId || current.ownerColor !== actingColor) return null;

  const remainingQueue = state.mutationQueue.slice(1);
  return resolveAfterMutation({ ...state, mutationQueue: remainingQueue });
}

// Called when the 15-second mutation timer expires — auto-decline.
export function handleMutationTimeout(state: GameState): MutationOutcome | null {
  if (state.phase !== 'mutation' || !state.mutationQueue[0]) return null;
  const remainingQueue = state.mutationQueue.slice(1);
  return resolveAfterMutation({ ...state, mutationQueue: remainingQueue });
}

function resolveAfterMutation(state: GameState): MutationOutcome {
  const next = state.mutationQueue[0] ?? null;

  if (next) {
    // More mutations to process — stay in mutation phase
    return { newState: { ...state, phase: 'mutation' }, gameOver: false, winner: null, nextMutation: next };
  }

  // Queue drained — check game over and resume
  const nextColor = state.currentTurn;
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;

  if (isCheckmate(state, nextColor)) {
    gameOver = true;
    winner = nextColor === 'white' ? 'black' : 'white';
    reason = 'checkmate';
  } else if (isStalemate(state, nextColor)) {
    gameOver = true;
    winner = null;
    reason = 'stalemate';
  }

  const finalState: GameState = gameOver
    ? { ...state, phase: 'complete', winner, gameOverReason: reason }
    : { ...state, phase: 'active' };

  return { newState: finalState, gameOver, winner, reason, nextMutation: null };
}

// ---- Promotion handling (unchanged from V1, plus processes pending mutation queue) ----

export interface PromotionOutcome {
  newState: GameState;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
  newTriggers: MutationPending[];
}

export function handlePromotion(
  state: GameState,
  pieceId: string,
  newType: PieceType,
  upgradeId: string | null,
  actingColor: Color
): PromotionOutcome | null {
  if (state.phase !== 'promotion') return null;
  if (!state.promotionPending || state.promotionPending.pieceId !== pieceId) return null;

  const validTypes: PieceType[] = ['queen', 'rook', 'bishop', 'knight'];
  if (!validTypes.includes(newType)) return null;

  const upgradeConfig = upgradeId
    ? state.promotionPending.upgradeOptions.find(u => u.id === upgradeId) ?? null
    : null;

  let promoted = applyPromotion(state, pieceId, newType, upgradeConfig);
  promoted = { ...promoted, phase: 'active', promotionPending: undefined };

  // Drain any triggers that queued up during promotion
  const pendingTriggers = promoted.mutationQueue;

  if (pendingTriggers.length > 0) {
    return {
      newState: { ...promoted, phase: 'mutation' },
      gameOver: false,
      winner: null,
      newTriggers: pendingTriggers,
    };
  }

  return resolveGameOverPromotion(promoted, actingColor);
}

export function handlePromotionTimeout(
  state: GameState,
  actingColor: Color
): PromotionOutcome | null {
  if (!state.promotionPending) return null;
  const { pieceId, upgradeOptions } = state.promotionPending;
  const upgradeId = upgradeOptions[0]?.id ?? null;
  return handlePromotion(state, pieceId, 'queen', upgradeId, actingColor);
}

function resolveGameOverPromotion(state: GameState, actingColor: Color): PromotionOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;

  if (isCheckmate(state, nextColor)) {
    gameOver = true;
    winner = actingColor;
    reason = 'checkmate';
  } else if (isStalemate(state, nextColor)) {
    gameOver = true;
    winner = null;
    reason = 'stalemate';
  }

  const finalState: GameState = gameOver
    ? { ...state, phase: 'complete', winner, gameOverReason: reason }
    : state;

  return { newState: finalState, gameOver, winner, reason, newTriggers: [] };
}

// ---- Game-over resolution helper (used by handleMove) ----

function resolveGameOver(
  state: GameState,
  move: Move,
  actingColor: Color,
  atomic: boolean,
  newTriggers: MutationPending[]
): MoveOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;

  if (isCheckmate(state, nextColor)) {
    gameOver = true;
    winner = actingColor;
    reason = 'checkmate';
  } else if (isStalemate(state, nextColor)) {
    gameOver = true;
    winner = null;
    reason = 'stalemate';
  }

  const finalState: GameState = gameOver
    ? { ...state, phase: 'complete', winner, gameOverReason: reason }
    : { ...state, phase: 'active' };

  return {
    newState: finalState,
    move,
    atomic,
    gameOver,
    winner,
    reason,
    promotionRequired: false,
    upgradeOptions: [],
    newTriggers,
  };
}

// ---- Timeout / disconnect helpers (unchanged from V1) ----

export function applyTimeout(state: GameState, timedOutColor: Color): GameState {
  const winner: Color = timedOutColor === 'white' ? 'black' : 'white';
  return { ...state, phase: 'complete', winner, gameOverReason: 'timeout' };
}

export function applyForfeit(state: GameState, forfeitColor: Color): GameState {
  const winner: Color = forfeitColor === 'white' ? 'black' : 'white';
  return { ...state, phase: 'complete', winner, gameOverReason: 'forfeit' };
}

export function applyDisconnectWin(state: GameState, disconnectedColor: Color): GameState {
  const winner: Color = disconnectedColor === 'white' ? 'black' : 'white';
  return { ...state, phase: 'complete', winner, gameOverReason: 'disconnect' };
}

export function sanitizeStateForPlayer(state: GameState, _playerColor: Color): GameState {
  return state;
}
