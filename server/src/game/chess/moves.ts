// Pseudo-legal and legal move generation, move simulation for check filtering.

import { Color, GameState, Piece, Position } from '@hexchess/shared';
import {
  inBounds, opponent, getPieceAt,
  BISHOP_DIRS, ROOK_DIRS, QUEEN_DIRS, ALL_DIRS,
  rayMoves, knightSquares, kingSquaresNoCastle,
} from './helpers';
import { isInCheck, isSquareAttackedBy } from './attack';

// ---- Pseudo-legal generation ----

function getPawnMoves(state: GameState, piece: Piece): Position[] {
  const { row, col } = piece.position;
  const dir = piece.color === 'white' ? -1 : 1;
  const startRow = piece.color === 'white' ? 6 : 1;
  const result: Position[] = [];

  if (inBounds(row + dir, col) && !getPieceAt(state, { row: row + dir, col })) {
    result.push({ row: row + dir, col });
    if (row === startRow && !getPieceAt(state, { row: row + 2 * dir, col })) {
      result.push({ row: row + 2 * dir, col });
    }
  }

  for (const dc of [-1, 1]) {
    const nr = row + dir; const nc = col + dc;
    if (!inBounds(nr, nc)) continue;
    const target = getPieceAt(state, { row: nr, col: nc });
    if (target && target.color !== piece.color) {
      result.push({ row: nr, col: nc });
    } else if (!target && state.enPassantTarget?.row === nr && state.enPassantTarget?.col === nc) {
      result.push({ row: nr, col: nc });
    }
  }
  return result;
}

function getCastleMoves(state: GameState, piece: Piece): Position[] {
  if (piece.hasMoved) return [];
  const { row } = piece.position;
  const opp = opponent(piece.color);
  const result: Position[] = [];

  if (isInCheck(state, piece.color)) return [];

  const ksRookId = state.board[row][7];
  const ksRook = ksRookId ? state.pieces[ksRookId] : null;
  if (ksRook?.type === 'rook' && !ksRook.hasMoved &&
      !state.board[row][5] && !state.board[row][6] &&
      !isSquareAttackedBy(state, { row, col: 5 }, opp) &&
      !isSquareAttackedBy(state, { row, col: 6 }, opp)) {
    result.push({ row, col: 6 });
  }

  const qsRookId = state.board[row][0];
  const qsRook = qsRookId ? state.pieces[qsRookId] : null;
  if (qsRook?.type === 'rook' && !qsRook.hasMoved &&
      !state.board[row][1] && !state.board[row][2] && !state.board[row][3] &&
      !isSquareAttackedBy(state, { row, col: 3 }, opp) &&
      !isSquareAttackedBy(state, { row, col: 2 }, opp)) {
    result.push({ row, col: 2 });
  }
  return result;
}

function getPseudoLegalMoves(state: GameState, piece: Piece): Position[] {
  switch (piece.type) {
    case 'pawn':   return getPawnMoves(state, piece);
    case 'knight': return knightSquares(state, piece);
    case 'bishop': return rayMoves(state, piece, BISHOP_DIRS);
    case 'rook':   return rayMoves(state, piece, ROOK_DIRS);
    case 'queen':  return rayMoves(state, piece, QUEEN_DIRS);
    case 'king':   return [...kingSquaresNoCastle(state, piece), ...getCastleMoves(state, piece)];
  }
}

// ---- Move simulation (for legality filtering only) ----

function simulateMove(
  state: GameState,
  piece: Piece,
  to: Position
): Pick<GameState, 'board' | 'pieces'> {
  const board = state.board.map(r => [...r]);
  const pieces: Record<string, Piece> = {};
  for (const [id, p] of Object.entries(state.pieces)) {
    pieces[id] = { ...p, position: { ...p.position }, upgrades: [...p.upgrades] };
  }

  const { row, col } = piece.position;
  const isEnPassant =
    piece.type === 'pawn' &&
    !board[to.row][to.col] &&
    state.enPassantTarget?.row === to.row &&
    state.enPassantTarget?.col === to.col;

  const capturedId = isEnPassant
    ? board[piece.color === 'white' ? to.row + 1 : to.row - 1][to.col]
    : board[to.row][to.col];

  const hasAtomic = piece.upgrades.some(u => u.id === 'atomic');
  const isAtomicCapture = hasAtomic && (capturedId !== null && capturedId !== undefined);

  if (isAtomicCapture) {
    board[row][col] = null;
    if (capturedId) {
      if (isEnPassant) {
        board[piece.color === 'white' ? to.row + 1 : to.row - 1][to.col] = null;
      } else {
        board[to.row][to.col] = null;
      }
      delete pieces[capturedId];
    }
    delete pieces[piece.id];
    for (const [dr, dc] of ALL_DIRS) {
      const ar = to.row + dr; const ac = to.col + dc;
      if (!inBounds(ar, ac)) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      delete pieces[adjId];
    }
  } else {
    if (isEnPassant && capturedId) {
      board[piece.color === 'white' ? to.row + 1 : to.row - 1][to.col] = null;
      delete pieces[capturedId];
    }
    if (piece.type === 'king' && Math.abs(to.col - col) === 2) {
      if (to.col === 6) {
        const rookId = board[row][7];
        if (rookId) { board[row][7] = null; board[row][5] = rookId; pieces[rookId] = { ...pieces[rookId], position: { row, col: 5 } }; }
      } else {
        const rookId = board[row][0];
        if (rookId) { board[row][0] = null; board[row][3] = rookId; pieces[rookId] = { ...pieces[rookId], position: { row, col: 3 } }; }
      }
    }
    const normalCaptureId = board[to.row][to.col];
    if (normalCaptureId && !isEnPassant) delete pieces[normalCaptureId];
    board[row][col] = null;
    board[to.row][to.col] = piece.id;
    pieces[piece.id] = { ...pieces[piece.id], position: to };
  }

  return { board, pieces };
}

// ---- Legal move generation (with ability state rules) ----

export function getValidMoves(state: GameState, pieceId: string): Position[] {
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== state.currentTurn) return [];

  // V3: anchored pieces cannot move
  if (piece.anchorTurnsRemaining > 0) return [];

  return getPseudoLegalMoves(state, piece).filter(to => {
    const targetPiece = getPieceAt(state, to);

    // V3: cannot capture an anchored enemy
    if (targetPiece && targetPiece.color !== piece.color && targetPiece.anchorTurnsRemaining > 0) return false;
    // V3: phantom no-capture restriction
    if (piece.phantomNoCapture && targetPiece && targetPiece.color !== piece.color) return false;
    // V3: surge-exposed piece — bypasses pin validation
    if (targetPiece && targetPiece.color !== piece.color && targetPiece.surgeExposed) return true;

    const sim = simulateMove(state, piece, to);
    const ownKingExists = Object.values(sim.pieces).some(p => p.color === piece.color && p.type === 'king');
    if (!ownKingExists) return false; // Atomic self-destruct
    return !isInCheck(sim, piece.color);
  });
}

export function hasAnyLegalMove(state: GameState, color: Color): boolean {
  const tempState = { ...state, currentTurn: color };
  return Object.values(state.pieces)
    .filter(p => p.color === color)
    .some(p => getValidMoves(tempState, p.id).length > 0);
}
