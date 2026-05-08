import { AbilityId, Color, GameState, Position } from '@hexchess/shared';
import { GAME_CONFIG } from '../../config';
import { isCheckmate, isStalemate } from '../chess';
import { AbilityOutcome, applyAbility, applyEchoAbility, tickAbilityStates } from '../abilities';
import { drawUpgradeOptions } from '../upgrades';
import { withDerivedPhase } from './phase';

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

  let st = tickAbilityStates(outcome.newState, actingColor);
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

  return {
    newState: gameOver ? withDerivedPhase({ ...st, winner, gameOverReason: reason }) : withDerivedPhase(st),
    gameOver, winner, reason, promotionNeeded: false, abilityPending: false,
  };
}
