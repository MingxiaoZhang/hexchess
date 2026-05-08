import { Color, GameState, Move, MutationPending, UpgradeConfig } from '@hexchess/shared';
import { GAME_CONFIG } from '../../config';
import { applyMove, getValidMoves, isCheckmate, isStalemate } from '../chess';
import { detectAndUpdateTriggers } from '../triggers';
import { drawUpgradeOptions } from '../upgrades';
import { applyBerserkSecondCapture, tickAbilityStates } from '../abilities';
import { withDerivedPhase } from './phase';

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
  to: { row: number; col: number },
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
  prevState: GameState, afterMove: GameState, move: Move, actingColor: Color, atomic: boolean
): MoveOutcome {
  const { state: afterTriggers, newTriggers } = detectAndUpdateTriggers(prevState, afterMove, move);

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

export function resolveGameOver(
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
