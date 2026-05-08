import { Color, GameState, MutationPending } from '@hexchess/shared';
import { isCheckmate, isStalemate } from '../chess';
import { withDerivedPhase } from './phase';

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
