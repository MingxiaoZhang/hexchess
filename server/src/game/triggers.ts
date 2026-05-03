// Config-driven trigger detection. Adding a new trigger in V3 = add a config entry here.
// No other files need to change.

import { Color, GameState, Move, MutationPending, Piece, PieceType, TriggerType, UpgradeConfig } from '@hexchess/shared';
import { MUTATION_POOL } from '../config';
import { getAttackSquares, isInCheck } from './chess';

// ---- Trigger config ----

interface TriggerConfig {
  type: TriggerType;
  // Compute the updated triggerCount for one piece after a move.
  // Return the new count (unchanged if not relevant to this move).
  updateCount: (
    piece: Piece,
    prevState: GameState,
    newState: GameState,
    move: Move
  ) => number;
  // How many counts are needed for the trigger to fire.
  requiredCount: number;
}

const TRIGGER_CONFIGS: Partial<Record<PieceType, TriggerConfig>> = {
  pawn: {
    type: 'pawn_advance',
    requiredCount: 1,
    updateCount(piece, _prev, newState) {
      if (piece.triggerCount >= 1) return piece.triggerCount;
      const newPiece = newState.pieces[piece.id];
      if (!newPiece) return piece.triggerCount;
      // white crosses rank 5 (row 3), black crosses rank 4 (row 4)
      const crossed =
        piece.color === 'white'
          ? newPiece.position.row <= 3
          : newPiece.position.row >= 4;
      return crossed ? 1 : piece.triggerCount;
    },
  },

  knight: {
    type: 'knight_captures',
    requiredCount: 2,
    updateCount(piece, _prev, _next, move) {
      if (move.pieceId !== piece.id) return piece.triggerCount;
      if (!move.capturedPieceId) return piece.triggerCount;
      return piece.triggerCount + 1;
    },
  },

  // Bishop trigger is handled separately via board-level bishop-revenge check.
  // No per-piece updateCount needed (its count stays at 0; trigger fires via special path).

  rook: {
    type: 'rook_opposition',
    requiredCount: 1,
    updateCount(piece, _prev, newState, move) {
      if (piece.triggerCount >= 1) return piece.triggerCount;
      // Only check when THIS rook moves — avoids triggering from the starting position
      // where a-file and h-file rooks already share files.
      if (move.pieceId !== piece.id) return piece.triggerCount;
      const newRook = newState.pieces[piece.id];
      if (!newRook) return piece.triggerCount;
      const inOpposition = Object.values(newState.pieces).some(
        p => p.type === 'rook' && p.color !== piece.color &&
             p.position.col === newRook.position.col
      );
      return inOpposition ? 1 : piece.triggerCount;
    },
  },

  queen: {
    type: 'queen_checks',
    requiredCount: 2,
    updateCount(piece, _prev, newState, move) {
      // Only counts when the queen itself just moved and delivered check
      if (move.pieceId !== piece.id) return piece.triggerCount;
      const opponentColor: Color = piece.color === 'white' ? 'black' : 'white';
      if (!isInCheck(newState, opponentColor)) return piece.triggerCount;
      // Verify the queen is the piece delivering the check
      const queen = newState.pieces[piece.id];
      if (!queen) return piece.triggerCount;
      const king = Object.values(newState.pieces).find(
        p => p.color === opponentColor && p.type === 'king'
      );
      if (!king) return piece.triggerCount;
      const queenAttacks = getAttackSquares(newState, queen);
      const deliversCheck = queenAttacks.some(
        sq => sq.row === king.position.row && sq.col === king.position.col
      );
      return deliversCheck ? piece.triggerCount + 1 : piece.triggerCount;
    },
  },
};

// ---- Public API ----

export interface TriggerDetectionResult {
  state: GameState;
  newTriggers: MutationPending[];
}

/**
 * After every move: update triggerCounts for all relevant pieces,
 * detect which pieces just reached their required count, and return them
 * as MutationPending entries. The returned state has updated triggerCounts
 * and triggered=true on fired pieces. Does NOT change game phase.
 */
export function detectAndUpdateTriggers(
  prevState: GameState,
  newState: GameState,
  move: Move
): TriggerDetectionResult {
  const pieces = { ...newState.pieces };
  const newTriggers: MutationPending[] = [];

  // Per-piece trigger count updates
  for (const piece of Object.values(newState.pieces)) {
    if (piece.triggered) continue;
    const config = TRIGGER_CONFIGS[piece.type];
    if (!config) continue;

    const newCount = config.updateCount(piece, prevState, newState, move);
    if (newCount === piece.triggerCount) continue; // no change

    const updated = { ...piece, triggerCount: newCount };
    pieces[piece.id] = updated;

    if (newCount >= config.requiredCount) {
      pieces[piece.id] = { ...updated, triggered: true };
      newTriggers.push(buildMutation(pieces[piece.id], config.type));
    }
  }

  // Bishop revenge: fires when a bishop is captured
  const capturedIds = [
    move.capturedPieceId,
    ...(move.atomicDestroyedIds ?? []),
  ].filter((id): id is string => !!id);

  for (const capturedId of capturedIds) {
    const capturedPiece = prevState.pieces[capturedId];
    if (capturedPiece?.type !== 'bishop') continue;

    // Find surviving bishop of the same color that hasn't triggered
    const survivingBishop = Object.values(pieces).find(
      p => p.type === 'bishop' &&
           p.color === capturedPiece.color &&
           !p.triggered &&
           p.id !== capturedId
    );
    if (!survivingBishop) continue;

    pieces[survivingBishop.id] = { ...survivingBishop, triggered: true };
    newTriggers.push(buildMutation(pieces[survivingBishop.id], 'bishop_revenge'));
  }

  // De-duplicate: same pieceId should not appear twice
  const seen = new Set<string>();
  const dedupedTriggers = newTriggers.filter(t => {
    if (seen.has(t.pieceId)) return false;
    seen.add(t.pieceId);
    return true;
  });

  const updatedState: GameState = { ...newState, pieces };
  return { state: updatedState, newTriggers: dedupedTriggers };
}

function buildMutation(piece: Piece, triggerType: TriggerType): MutationPending {
  return {
    pieceId: piece.id,
    pieceType: piece.type,
    triggerType,
    ownerColor: piece.color,
    mutations: [...MUTATION_POOL],
  };
}

// Trigger description strings — shown in the mutation modal.
export function triggerDescription(trigger: TriggerType, pieceType: PieceType): string {
  switch (trigger) {
    case 'pawn_advance':
      return 'Your pawn crossed the halfway line!';
    case 'knight_captures':
      return 'Your knight captured 2 pieces!';
    case 'bishop_revenge':
      return 'Your bishop\'s partner was captured — revenge is earned!';
    case 'rook_opposition':
      return 'Your rook faces the opponent\'s rook on the same file!';
    case 'queen_checks':
      return 'Your queen delivered check twice!';
    default:
      return `Your ${pieceType} earned a mutation!`;
  }
}
