import { Color, GameState, MutationPending, PieceType } from '@hexchess/shared';
import { applyPromotion, isCheckmate, isStalemate } from '../chess';
import { withDerivedPhase } from './phase';

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

  const promoted = withDerivedPhase({
    ...applyPromotion(state, pieceId, newType, upgradeConfig),
    promotionPending: undefined,
  });

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
