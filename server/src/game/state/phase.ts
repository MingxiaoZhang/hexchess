import { GamePhase, GameState } from '@hexchess/shared';

// Phase is derived from the rest of the state — never set by hand.
// Priority: complete > promotion > ability_pending > mutation > active

export function derivePhase(state: Omit<GameState, 'phase'>): GamePhase {
  if (state.winner !== undefined)               return 'complete';
  if (state.promotionPending)                   return 'promotion';
  if (state.abilityPending)                     return 'ability_pending';
  if ((state.mutationQueue ?? []).length > 0)   return 'mutation';
  return 'active';
}

export function withDerivedPhase(
  state: Omit<GameState, 'phase'> & Partial<Pick<GameState, 'phase'>>
): GameState {
  return { ...state, phase: derivePhase(state) } as GameState;
}
