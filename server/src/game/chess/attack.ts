// Threat detection: which squares a piece attacks, check detection.

import { Color, GameState, Piece, Position } from '@hexchess/shared';
import {
  BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS,
  rayMoves, knightSquares, kingSquaresNoCastle, pawnAttacks,
  opponent,
} from './helpers';

export function getAttackSquares(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  switch (piece.type) {
    case 'pawn':   return pawnAttacks(piece);
    case 'knight': return knightSquares(state, piece);
    case 'bishop': return rayMoves(state, piece, BISHOP_DIRS);
    case 'rook':   return rayMoves(state, piece, ROOK_DIRS);
    case 'queen':  return rayMoves(state, piece, QUEEN_DIRS);
    case 'king':   return kingSquaresNoCastle(state, piece);
  }
}

export function isSquareAttackedBy(
  state: Pick<GameState, 'board' | 'pieces'>,
  pos: Position,
  attackerColor: Color
): boolean {
  return Object.values(state.pieces)
    .filter(p => p.color === attackerColor)
    .some(p => getAttackSquares(state, p).some(sq => sq.row === pos.row && sq.col === pos.col));
}

export function isInCheck(
  state: Pick<GameState, 'board' | 'pieces'>,
  color: Color
): boolean {
  const king = Object.values(state.pieces).find(p => p.color === color && p.type === 'king');
  if (!king) return false;
  return isSquareAttackedBy(state, king.position, opponent(color));
}
