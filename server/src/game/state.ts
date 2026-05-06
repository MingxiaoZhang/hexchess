import {
  AbilityId,
  Color,
  GameState,
  Move,
  MutationPending,
  PieceType,
  Position,
  UpgradeConfig,
} from '@hexchess/shared';
import { GAME_CONFIG } from '../config';
import { applyMove, applyPromotion, getValidMoves, isCheckmate, isStalemate } from './chess';
import { detectAndUpdateTriggers } from './triggers';
import { drawUpgradeOptions } from './upgrades';
import {
  AbilityOutcome,
  applyAbility,
  applyBerserkSecondCapture,
  applyEchoAbility,
  tickAbilityStates,
} from './abilities';

// ---- Move handling ----

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
  berserkPending: boolean;
}

export function handleMove(
  state: GameState,
  pieceId: string,
  to: Position,
  actingColor: Color
): MoveOutcome | null {
  // In ability_pending/berserk, allow only the Berserk second capture
  if (state.phase === 'ability_pending' && state.abilityPending?.type === 'berserk') {
    if (state.abilityPending.pieceColor !== actingColor) return null;
    const outcome = applyBerserkSecondCapture(state, pieceId, to, actingColor);
    if (!outcome) return null;
    return finalizeMoveOutcome(state, outcome.newState, {
      pieceId, from: state.pieces[pieceId]?.position ?? to, to,
      capturedPieceId: state.board[to.row]?.[to.col] ?? undefined,
    }, actingColor, false);
  }

  if (state.phase !== 'active') return null;
  if (state.currentTurn !== actingColor) return null;

  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;

  const validMoves = getValidMoves(state, pieceId);
  if (!validMoves.some(m => m.row === to.row && m.col === to.col)) return null;

  const { newState: afterMove, move, promotionNeeded } = applyMove(state, pieceId, to);
  const tickedState = tickAbilityStates(afterMove, actingColor);

  // Check if Berserk should activate (capturing piece still exists, player has Berserk)
  if (move.capturedPieceId && !move.atomic) {
    const capturingPiece = tickedState.pieces[pieceId];
    const hasBerserk = tickedState.playerAbilities[actingColor].hand.some(
      c => c.id === 'berserk' && (c.usesRemaining === null || c.usesRemaining > 0)
    );
    if (capturingPiece && hasBerserk) {
      const tempState = { ...tickedState, currentTurn: actingColor };
      const secondTargets = getValidMoves(tempState, pieceId).filter(m => {
        const id = tickedState.board[m.row]?.[m.col];
        return id && tickedState.pieces[id]?.color !== actingColor;
      });
      if (secondTargets.length > 0) {
        const berserkState: GameState = {
          ...tickedState,
          phase: 'ability_pending',
          abilityPending: { type: 'berserk', pieceId, pieceColor: actingColor, validTargets: secondTargets },
        };
        return {
          newState: berserkState, move, atomic: false, gameOver: false, winner: null,
          promotionRequired: false, upgradeOptions: [], newTriggers: [], berserkPending: true,
        };
      }
    }
  }

  return finalizeMoveOutcome(state, tickedState, move, actingColor, move.atomic ?? false);
}

function finalizeMoveOutcome(
  prevState: GameState,
  afterMove: GameState,
  move: Move,
  actingColor: Color,
  atomic: boolean
): MoveOutcome {
  const { state: afterTriggers, newTriggers } = detectAndUpdateTriggers(prevState, afterMove, move);

  // Atomic king-kill wins immediately
  if (atomic) {
    const opp: Color = actingColor === 'white' ? 'black' : 'white';
    const oppKingAlive = Object.values(afterTriggers.pieces).some(p => p.type === 'king' && p.color === opp);
    if (!oppKingAlive) {
      return {
        newState: { ...afterTriggers, phase: 'complete', winner: actingColor, gameOverReason: 'checkmate' },
        move, atomic: true, gameOver: true, winner: actingColor, reason: 'checkmate',
        promotionRequired: false, upgradeOptions: [], newTriggers, berserkPending: false,
      };
    }
  }

  // Promotion
  if (move.isPromotion) {
    const upgradeOptions = drawUpgradeOptions(GAME_CONFIG, GAME_CONFIG.promotionUpgradeCount);
    const pendingQueue = [...afterTriggers.mutationQueue, ...newTriggers];
    return {
      newState: {
        ...afterTriggers, phase: 'promotion',
        promotionPending: { pieceId: move.pieceId, position: move.to, upgradeOptions },
        mutationQueue: pendingQueue,
      },
      move, atomic, gameOver: false, winner: null,
      promotionRequired: true, upgradeOptions, newTriggers, berserkPending: false,
    };
  }

  // Mutation triggers
  const fullQueue = [...afterTriggers.mutationQueue, ...newTriggers];
  if (fullQueue.length > 0) {
    return {
      newState: { ...afterTriggers, phase: 'mutation', mutationQueue: fullQueue },
      move, atomic, gameOver: false, winner: null,
      promotionRequired: false, upgradeOptions: [], newTriggers, berserkPending: false,
    };
  }

  return resolveGameOver(afterTriggers, move, actingColor, atomic, newTriggers);
}

// ---- Ability handling ----

export interface AbilityUseOutcome {
  newState: GameState;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
  promotionNeeded: boolean;
  abilityPending: boolean;
}

export function handleUseAbility(
  state: GameState,
  abilityId: AbilityId,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityUseOutcome | null {
  // In echo_pending, the player is using the copied ability
  if (state.phase === 'ability_pending' && state.abilityPending?.type === 'echo') {
    if (state.abilityPending.pieceColor !== actingColor) return null;
    const outcome = applyEchoAbility(state, abilityId, pieceId, targetPos, actingColor);
    if (!outcome) return null;
    return finalizeAbilityOutcome(outcome, actingColor);
  }

  if (state.phase !== 'active') return null;
  if (state.currentTurn !== actingColor) return null;

  const outcome = applyAbility(state, abilityId, pieceId, targetPos, actingColor);
  if (!outcome) return null;

  return finalizeAbilityOutcome(outcome, actingColor);
}

function finalizeAbilityOutcome(outcome: AbilityOutcome, actingColor: Color): AbilityUseOutcome {
  if (!outcome.turnEnds) {
    // Ability entered a pending state (Berserk, Echo) — don't advance turn or check game over
    return { newState: outcome.newState, gameOver: false, winner: null, promotionNeeded: false, abilityPending: true };
  }

  let st = outcome.newState;

  // Tick ability states (turn ends)
  st = tickAbilityStates(st, actingColor);

  // Switch turn
  const nextTurn: Color = actingColor === 'white' ? 'black' : 'white';
  st = { ...st, currentTurn: nextTurn };

  // Check for Surge-caused promotion (pawn just surged to its back rank)
  const lastTarget = st.playerAbilities[actingColor].lastUsedTargetPos;
  if (lastTarget) {
    const promotionRow = actingColor === 'white' ? 0 : 7;
    if (lastTarget.row === promotionRow) {
      const movedPiece = Object.values(st.pieces).find(
        p => p.position.row === lastTarget.row && p.position.col === lastTarget.col &&
             p.color === actingColor && p.type === 'pawn'
      );
      if (movedPiece) {
        const upgradeOptions = drawUpgradeOptions(GAME_CONFIG, GAME_CONFIG.promotionUpgradeCount);
        return {
          newState: { ...st, phase: 'promotion', promotionPending: { pieceId: movedPiece.id, position: lastTarget, upgradeOptions } },
          gameOver: false, winner: null, promotionNeeded: true, abilityPending: false,
        };
      }
    }
  }

  // Check game over
  let gameOver = false;
  let winner: Color | null = null;
  let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(st, nextTurn)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(st, nextTurn)) { gameOver = true; winner = null; reason = 'stalemate'; }

  const finalState: GameState = gameOver
    ? { ...st, phase: 'complete', winner, gameOverReason: reason }
    : { ...st, phase: 'active' };

  return { newState: finalState, gameOver, winner, reason, promotionNeeded: false, abilityPending: false };
}

// ---- Promotion handling ----

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

  const pendingTriggers = promoted.mutationQueue;
  if (pendingTriggers.length > 0) {
    return { newState: { ...promoted, phase: 'mutation' }, gameOver: false, winner: null, newTriggers: pendingTriggers };
  }

  return resolveGameOverPromotion(promoted, actingColor);
}

export function handlePromotionTimeout(
  state: GameState,
  actingColor: Color
): PromotionOutcome | null {
  if (!state.promotionPending) return null;
  const { pieceId, upgradeOptions } = state.promotionPending;
  return handlePromotion(state, pieceId, 'queen', upgradeOptions[0]?.id ?? null, actingColor);
}

function resolveGameOverPromotion(state: GameState, actingColor: Color): PromotionOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  const finalState = gameOver ? { ...state, phase: 'complete' as const, winner, gameOverReason: reason } : state;
  return { newState: finalState, gameOver, winner, reason, newTriggers: [] };
}

// ---- Mutation handling ----

export interface MutationOutcomeResult {
  newState: GameState;
  gameOver: boolean;
  winner: Color | null;
  reason?: 'checkmate' | 'stalemate';
  nextMutation: MutationPending | null;
}

export function handleMutationAccept(
  state: GameState, pieceId: string, mutationId: string, actingColor: Color
): MutationOutcomeResult | null {
  if (state.phase !== 'mutation') return null;
  const current = state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId || current.ownerColor !== actingColor) return null;

  const mutationConfig = current.mutations.find(m => m.id === mutationId);
  if (!mutationConfig) return null;

  const piece = state.pieces[pieceId];
  if (!piece) return null;

  const newUpgrade = { id: mutationConfig.id, name: mutationConfig.name, description: mutationConfig.description, usesRemaining: null as null };
  const updatedPieces = { ...state.pieces, [pieceId]: { ...piece, upgrades: [...piece.upgrades, newUpgrade] } };
  const remainingQueue = state.mutationQueue.slice(1);
  return resolveAfterMutation({ ...state, pieces: updatedPieces, mutationQueue: remainingQueue });
}

export function handleMutationDecline(
  state: GameState, pieceId: string, actingColor: Color
): MutationOutcomeResult | null {
  if (state.phase !== 'mutation') return null;
  const current = state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId || current.ownerColor !== actingColor) return null;
  return resolveAfterMutation({ ...state, mutationQueue: state.mutationQueue.slice(1) });
}

export function handleMutationTimeout(state: GameState): MutationOutcomeResult | null {
  if (state.phase !== 'mutation' || !state.mutationQueue[0]) return null;
  return resolveAfterMutation({ ...state, mutationQueue: state.mutationQueue.slice(1) });
}

function resolveAfterMutation(state: GameState): MutationOutcomeResult {
  const next = state.mutationQueue[0] ?? null;
  if (next) return { newState: { ...state, phase: 'mutation' }, gameOver: false, winner: null, nextMutation: next };

  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = nextColor === 'white' ? 'black' : 'white'; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  const finalState = gameOver ? { ...state, phase: 'complete' as const, winner, gameOverReason: reason } : { ...state, phase: 'active' as const };
  return { newState: finalState, gameOver, winner, reason, nextMutation: null };
}

// ---- Game-over resolution ----

function resolveGameOver(
  state: GameState, move: Move, actingColor: Color, atomic: boolean, newTriggers: MutationPending[]
): MoveOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  const finalState = gameOver ? { ...state, phase: 'complete' as const, winner, gameOverReason: reason } : { ...state, phase: 'active' as const };
  return { newState: finalState, move, atomic, gameOver, winner, reason, promotionRequired: false, upgradeOptions: [], newTriggers, berserkPending: false };
}

// ---- Timeout / disconnect ----

export function applyTimeout(state: GameState, timedOutColor: Color): GameState {
  return { ...state, phase: 'complete', winner: timedOutColor === 'white' ? 'black' : 'white', gameOverReason: 'timeout' };
}

export function applyForfeit(state: GameState, forfeitColor: Color): GameState {
  return { ...state, phase: 'complete', winner: forfeitColor === 'white' ? 'black' : 'white', gameOverReason: 'forfeit' };
}

export function applyDisconnectWin(state: GameState, disconnectedColor: Color): GameState {
  return { ...state, phase: 'complete', winner: disconnectedColor === 'white' ? 'black' : 'white', gameOverReason: 'disconnect' };
}

export function sanitizeStateForPlayer(state: GameState, playerColor: Color): GameState {
  // Opponent's ability hand is hidden (they see card backs, not which abilities)
  const opponent: Color = playerColor === 'white' ? 'black' : 'white';
  return {
    ...state,
    playerAbilities: {
      ...state.playerAbilities,
      [opponent]: {
        ...state.playerAbilities[opponent],
        hand: state.playerAbilities[opponent].hand.map(c => ({ ...c, id: '?' as AbilityId })),
        lastUsedAbilityId: state.playerAbilities[opponent].lastUsedAbilityId, // opponent can see last used
      },
    },
  };
}
