// Basic AI opponent. Priority: pursue triggers, capture when available, legal otherwise.
// Not designed to be a strong chess player — just enough to demonstrate trigger mechanics.

import { Color, GameState, Piece, Position, PieceType } from '@hexchess/shared';
import { getValidMoves, isInCheck } from './chess';

const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 10, knight: 30, bishop: 30, rook: 50, queen: 90, king: 0,
};

function scoreMove(
  state: GameState,
  piece: Piece,
  to: Position,
  aiColor: Color
): number {
  let score = 0;

  // Captures — value the captured piece
  const targetId = state.board[to.row]?.[to.col];
  if (targetId) {
    const captured = state.pieces[targetId];
    score += PIECE_VALUE[captured.type] * 2;
  }

  // En passant capture
  if (
    piece.type === 'pawn' &&
    !targetId &&
    state.enPassantTarget?.row === to.row &&
    state.enPassantTarget?.col === to.col
  ) {
    score += PIECE_VALUE.pawn;
  }

  // PAWN: bonus for advancing past halfway (trigger)
  if (piece.type === 'pawn' && !piece.triggered && piece.triggerCount < 1) {
    const crossedHalfway = aiColor === 'white' ? to.row <= 3 : to.row >= 4;
    if (crossedHalfway) score += 40;
    else {
      // Reward general forward progress
      const forwardBonus = aiColor === 'white'
        ? piece.position.row - to.row
        : to.row - piece.position.row;
      score += forwardBonus * 3;
    }
  }

  // KNIGHT: bonus for captures that advance toward 2-capture trigger
  if (piece.type === 'knight' && !piece.triggered && targetId) {
    const willComplete = piece.triggerCount + 1 >= 2;
    score += willComplete ? 50 : 25;
  }

  // ROOK: bonus for moving to a file where opponent rook sits (trigger)
  if (piece.type === 'rook' && !piece.triggered && piece.triggerCount < 1) {
    const opponentRooks = Object.values(state.pieces).filter(
      p => p.type === 'rook' && p.color !== aiColor
    );
    if (opponentRooks.some(r => r.position.col === to.col)) score += 40;
  }

  // QUEEN: be aggressive — push toward opponent pieces and checks
  if (piece.type === 'queen' && !piece.triggered) {
    // Prefer squares closer to opponent's king
    const opponentKing = Object.values(state.pieces).find(
      p => p.type === 'king' && p.color !== aiColor
    );
    if (opponentKing) {
      const dist = Math.max(
        Math.abs(to.row - opponentKing.position.row),
        Math.abs(to.col - opponentKing.position.col)
      );
      score += Math.max(0, (8 - dist) * 4);
    }
  }

  // Small random tiebreaker so AI doesn't always pick the same move
  score += Math.random() * 3;

  return score;
}

export interface AIMove {
  pieceId: string;
  to: Position;
}

export function chooseAIMove(state: GameState, aiColor: Color): AIMove | null {
  if (state.currentTurn !== aiColor) return null;

  let bestScore = -Infinity;
  let bestMove: AIMove | null = null;

  for (const piece of Object.values(state.pieces)) {
    if (piece.color !== aiColor) continue;
    const moves = getValidMoves(state, piece.id);

    for (const to of moves) {
      const score = scoreMove(state, piece, to, aiColor);
      if (score > bestScore) {
        bestScore = score;
        bestMove = { pieceId: piece.id, to };
      }
    }
  }

  return bestMove;
}

// AI always accepts mutations (immediately, no delay needed).
export const AI_ALWAYS_ACCEPTS = true;

// Suppress unused import
void isInCheck;
