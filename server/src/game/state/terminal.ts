import { AbilityId, Color, GameState } from '@hexchess/shared';
import { withDerivedPhase } from './phase';

export function applyTimeout(state: GameState, timedOutColor: Color): GameState {
  return withDerivedPhase({ ...state, winner: timedOutColor === 'white' ? 'black' : 'white', gameOverReason: 'timeout' });
}

export function applyForfeit(state: GameState, forfeitColor: Color): GameState {
  return withDerivedPhase({ ...state, winner: forfeitColor === 'white' ? 'black' : 'white', gameOverReason: 'forfeit' });
}

export function applyDisconnectWin(state: GameState, disconnectedColor: Color): GameState {
  return withDerivedPhase({ ...state, winner: disconnectedColor === 'white' ? 'black' : 'white', gameOverReason: 'disconnect' });
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
