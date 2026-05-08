// Public API of the chess engine. Import from here, not from sub-files directly.

export { getAttackSquares, isSquareAttackedBy, isInCheck } from './attack';
export { getValidMoves, hasAnyLegalMove } from './moves';
export { isCheckmate, isStalemate, applyMove, applyPromotion } from './rules';
export { initGameState } from './board';
export { getPhantomReachableSquares } from './phantom';

// Helpers exposed for use by triggers.ts and abilities.ts
export { inBounds, opponent, getPieceAt, ALL_DIRS, BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS } from './helpers';
