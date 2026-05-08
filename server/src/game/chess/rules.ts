// High-level game rules: checkmate, stalemate, move application, promotion.

import { Color, GameState, Move, Piece, PieceType, Position } from '@hexchess/shared';
import { ALL_DIRS, inBounds, opponent } from './helpers';
import { isInCheck } from './attack';
import { getValidMoves, hasAnyLegalMove } from './moves';

export { hasAnyLegalMove };

export function isCheckmate(state: GameState, color: Color): boolean {
  return isInCheck(state, color) && !hasAnyLegalMove(state, color);
}

export function isStalemate(state: GameState, color: Color): boolean {
  return !isInCheck(state, color) && !hasAnyLegalMove(state, color);
}

// Applies a validated move. Caller must call getValidMoves first to confirm legality.
export function applyMove(
  state: GameState,
  pieceId: string,
  to: Position
): { newState: GameState; move: Move; promotionNeeded: boolean } {
  const piece = state.pieces[pieceId];
  const { row, col } = piece.position;

  const board = state.board.map(r => [...r]);
  const pieces: Record<string, Piece> = {};
  for (const [id, p] of Object.entries(state.pieces)) {
    pieces[id] = { ...p, position: { ...p.position }, upgrades: p.upgrades.map(u => ({ ...u })) };
  }

  const capturedPieces = {
    byWhite: [...state.capturedPieces.byWhite],
    byBlack: [...state.capturedPieces.byBlack],
  };

  const move: Move = { pieceId, from: { row, col }, to: { ...to } };

  const isEnPassant =
    piece.type === 'pawn' &&
    !board[to.row][to.col] &&
    state.enPassantTarget?.row === to.row &&
    state.enPassantTarget?.col === to.col;

  const epCapturedRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
  const epCapturedId = isEnPassant ? board[epCapturedRow][to.col] : null;
  const normalCapturedId = isEnPassant ? null : board[to.row][to.col];
  const capturedId = epCapturedId ?? normalCapturedId;

  const hasAtomic = pieces[pieceId].upgrades.some(u => u.id === 'atomic');
  const isAtomicCapture = hasAtomic && !!capturedId;
  const atomicDestroyedIds: string[] = [];

  if (isAtomicCapture) {
    move.atomic = true;
    if (normalCapturedId) { board[to.row][to.col] = null; atomicDestroyedIds.push(normalCapturedId); }
    if (epCapturedId) { board[epCapturedRow][to.col] = null; atomicDestroyedIds.push(epCapturedId); }

    // Explosion: all adjacent pieces die (kings included — Atomic rule V3+)
    for (const [dr, dc] of ALL_DIRS) {
      const ar = to.row + dr; const ac = to.col + dc;
      if (!inBounds(ar, ac)) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      atomicDestroyedIds.push(adjId);
    }

    board[row][col] = null;
    atomicDestroyedIds.push(pieceId);
    for (const id of atomicDestroyedIds) delete pieces[id];

    move.capturedPieceId = capturedId;
    move.atomicDestroyedIds = atomicDestroyedIds;
    move.isEnPassant = isEnPassant;
  } else {
    if (isEnPassant && epCapturedId) {
      board[epCapturedRow][to.col] = null;
      const epPiece = state.pieces[epCapturedId];
      if (epPiece) capturedPieces[piece.color === 'white' ? 'byWhite' : 'byBlack'].push({ ...epPiece });
      move.capturedPieceId = epCapturedId;
      move.isEnPassant = true;
    }

    if (piece.type === 'king' && Math.abs(to.col - col) === 2) {
      move.isCastle = true;
      if (to.col === 6) {
        const rookId = board[row][7]!;
        board[row][7] = null; board[row][5] = rookId;
        pieces[rookId] = { ...pieces[rookId], position: { row, col: 5 }, hasMoved: true };
      } else {
        const rookId = board[row][0]!;
        board[row][0] = null; board[row][3] = rookId;
        pieces[rookId] = { ...pieces[rookId], position: { row, col: 3 }, hasMoved: true };
      }
    }

    if (normalCapturedId) {
      const capPiece = state.pieces[normalCapturedId];
      if (capPiece) capturedPieces[piece.color === 'white' ? 'byWhite' : 'byBlack'].push({ ...capPiece });
      move.capturedPieceId = normalCapturedId;
      delete pieces[normalCapturedId];
    }

    board[row][col] = null;
    board[to.row][to.col] = pieceId;
    pieces[pieceId] = { ...pieces[pieceId], position: to, hasMoved: true };
  }

  let enPassantTarget: Position | null = null;
  if (!isAtomicCapture && piece.type === 'pawn' && Math.abs(to.row - row) === 2) {
    enPassantTarget = { row: piece.color === 'white' ? to.row + 1 : to.row - 1, col: to.col };
  }

  const promotionRow = piece.color === 'white' ? 0 : 7;
  const promotionNeeded = !isAtomicCapture && piece.type === 'pawn' && to.row === promotionRow;
  if (promotionNeeded) move.isPromotion = true;

  const newState: GameState = {
    ...state,
    board,
    pieces,
    currentTurn: opponent(piece.color),
    phase: state.phase,
    moveNumber: state.moveNumber + (piece.color === 'black' ? 1 : 0),
    enPassantTarget,
    halfMoveClock: (piece.type === 'pawn' || !!capturedId || isAtomicCapture) ? 0 : state.halfMoveClock + 1,
    capturedPieces,
    lastMove: move,
  };

  return { newState, move, promotionNeeded };
}

export function applyPromotion(
  state: GameState,
  pieceId: string,
  newType: PieceType,
  upgrade: { id: string; name: string; description: string } | null
): GameState {
  const piece = state.pieces[pieceId];
  if (!piece) return state;

  const upgrades = upgrade
    ? [...piece.upgrades, { id: upgrade.id, name: upgrade.name, description: upgrade.description, usesRemaining: null as null }]
    : [...piece.upgrades];

  return { ...state, pieces: { ...state.pieces, [pieceId]: { ...piece, type: newType, upgrades } } };
}

// Re-export for convenience
export { getValidMoves, isInCheck };
