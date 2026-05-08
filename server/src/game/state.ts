import {
  AbilityId,
  Color,
  GamePhase,
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

// ---- Phase derivation ----
// Phase is a pure function of the rest of the state. Never set it by hand.
// Priority (top wins): complete > promotion > ability_pending > mutation > active

export function derivePhase(state: Omit<GameState, 'phase'>): GamePhase {
  if (state.winner !== undefined)                     return 'complete';
  if (state.promotionPending)                         return 'promotion';
  if (state.abilityPending)                           return 'ability_pending';
  if ((state.mutationQueue ?? []).length > 0)         return 'mutation';
  return 'active';
}

export function withDerivedPhase(
  state: Omit<GameState, 'phase'> & Partial<Pick<GameState, 'phase'>>
): GameState {
  return { ...state, phase: derivePhase(state) } as GameState;
}

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
  // Berserk second capture (ability_pending phase)
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

  // Auto-trigger Berserk if the capturing piece survived and the player has it
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
        const berserkState = withDerivedPhase({
          ...tickedState,
          abilityPending: { type: 'berserk', pieceId, pieceColor: actingColor, validTargets: secondTargets },
        });
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

  // Atomic king-kill: immediate win
  if (atomic) {
    const opp: Color = actingColor === 'white' ? 'black' : 'white';
    const oppKingAlive = Object.values(afterTriggers.pieces).some(p => p.type === 'king' && p.color === opp);
    if (!oppKingAlive) {
      return {
        newState: withDerivedPhase({ ...afterTriggers, winner: actingColor, gameOverReason: 'checkmate' }),
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
      newState: withDerivedPhase({
        ...afterTriggers,
        promotionPending: { pieceId: move.pieceId, position: move.to, upgradeOptions },
        mutationQueue: pendingQueue,
      }),
      move, atomic, gameOver: false, winner: null,
      promotionRequired: true, upgradeOptions, newTriggers, berserkPending: false,
    };
  }

  // Mutation triggers queued
  const fullQueue = [...afterTriggers.mutationQueue, ...newTriggers];
  if (fullQueue.length > 0) {
    return {
      newState: withDerivedPhase({ ...afterTriggers, mutationQueue: fullQueue }),
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
    return { newState: withDerivedPhase(outcome.newState), gameOver: false, winner: null, promotionNeeded: false, abilityPending: true };
  }

  let st = outcome.newState;
  st = tickAbilityStates(st, actingColor);
  const nextTurn: Color = actingColor === 'white' ? 'black' : 'white';
  st = { ...st, currentTurn: nextTurn };

  // Surge-caused promotion
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
          newState: withDerivedPhase({ ...st, promotionPending: { pieceId: movedPiece.id, position: lastTarget, upgradeOptions } }),
          gameOver: false, winner: null, promotionNeeded: true, abilityPending: false,
        };
      }
    }
  }

  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(st, nextTurn)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(st, nextTurn)) { gameOver = true; winner = null; reason = 'stalemate'; }

  const newState = gameOver
    ? withDerivedPhase({ ...st, winner, gameOverReason: reason })
    : withDerivedPhase(st);

  return { newState, gameOver, winner, reason, promotionNeeded: false, abilityPending: false };
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

  // Apply promotion and clear the pending marker
  const promoted = withDerivedPhase({
    ...applyPromotion(state, pieceId, newType, upgradeConfig),
    promotionPending: undefined,
  });

  // Process any mutation triggers queued during the promotion move
  if (promoted.mutationQueue.length > 0) {
    return { newState: withDerivedPhase(promoted), gameOver: false, winner: null, newTriggers: promoted.mutationQueue };
  }

  return resolveGameOverPromotion(promoted, actingColor);
}

export function handlePromotionTimeout(state: GameState, actingColor: Color): PromotionOutcome | null {
  if (!state.promotionPending) return null;
  const { pieceId, upgradeOptions } = state.promotionPending;
  return handlePromotion(state, pieceId, 'queen', upgradeOptions[0]?.id ?? null, actingColor);
}

function resolveGameOverPromotion(state: GameState, actingColor: Color): PromotionOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  return {
    newState: gameOver ? withDerivedPhase({ ...state, winner, gameOverReason: reason }) : state,
    gameOver, winner, reason, newTriggers: [],
  };
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
  return resolveAfterMutation({ ...state, pieces: updatedPieces, mutationQueue: state.mutationQueue.slice(1) });
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
  if (next) return { newState: withDerivedPhase(state), gameOver: false, winner: null, nextMutation: next };

  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = nextColor === 'white' ? 'black' : 'white'; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  return {
    newState: gameOver ? withDerivedPhase({ ...state, winner, gameOverReason: reason }) : withDerivedPhase(state),
    gameOver, winner, reason, nextMutation: null,
  };
}

// ---- Game-over resolution ----

function resolveGameOver(
  state: GameState, move: Move, actingColor: Color, atomic: boolean, newTriggers: MutationPending[]
): MoveOutcome {
  const nextColor = state.currentTurn;
  let gameOver = false; let winner: Color | null = null; let reason: 'checkmate' | 'stalemate' | undefined;
  if (isCheckmate(state, nextColor)) { gameOver = true; winner = actingColor; reason = 'checkmate'; }
  else if (isStalemate(state, nextColor)) { gameOver = true; winner = null; reason = 'stalemate'; }
  const newState = gameOver
    ? withDerivedPhase({ ...state, winner, gameOverReason: reason })
    : withDerivedPhase(state);
  return { newState, move, atomic, gameOver, winner, reason, promotionRequired: false, upgradeOptions: [], newTriggers, berserkPending: false };
}

// ---- Timeout / disconnect ----

export function applyTimeout(state: GameState, timedOutColor: Color): GameState {
  const winner: Color = timedOutColor === 'white' ? 'black' : 'white';
  return withDerivedPhase({ ...state, winner, gameOverReason: 'timeout' });
}

export function applyForfeit(state: GameState, forfeitColor: Color): GameState {
  const winner: Color = forfeitColor === 'white' ? 'black' : 'white';
  return withDerivedPhase({ ...state, winner, gameOverReason: 'forfeit' });
}

export function applyDisconnectWin(state: GameState, disconnectedColor: Color): GameState {
  const winner: Color = disconnectedColor === 'white' ? 'black' : 'white';
  return withDerivedPhase({ ...state, winner, gameOverReason: 'disconnect' });
}

export function sanitizeStateForPlayer(state: GameState, playerColor: Color): GameState {
  const opponent: Color = playerColor === 'white' ? 'black' : 'white';
  return {
    ...state,
    playerAbilities: {
      ...state.playerAbilities,
      [opponent]: {
        ...state.playerAbilities[opponent],
        hand: state.playerAbilities[opponent].hand.map(c => ({ ...c, id: '?' as AbilityId })),
        lastUsedAbilityId: state.playerAbilities[opponent].lastUsedAbilityId,
      },
    },
  };
}
