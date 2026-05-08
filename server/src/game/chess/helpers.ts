// Internal utilities shared across all chess modules.
// Nothing in this file depends on other chess files.

import { Color, GameState, Piece, Position } from '@hexchess/shared';

export function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

export function opponent(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export function getPieceAt(
  state: Pick<GameState, 'board' | 'pieces'>,
  pos: Position
): Piece | null {
  const id = state.board[pos.row]?.[pos.col];
  return id ? state.pieces[id] ?? null : null;
}

export const BISHOP_DIRS: [number, number][] = [[-1,-1],[-1,1],[1,-1],[1,1]];
export const ROOK_DIRS:   [number, number][] = [[-1,0],[1,0],[0,-1],[0,1]];
export const QUEEN_DIRS:  [number, number][] = [...BISHOP_DIRS, ...ROOK_DIRS];
export const ALL_DIRS:    [number, number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];

export function rayMoves(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece,
  dirs: [number, number][]
): Position[] {
  const result: Position[] = [];
  for (const [dr, dc] of dirs) {
    let r = piece.position.row + dr;
    let c = piece.position.col + dc;
    while (inBounds(r, c)) {
      const target = getPieceAt(state, { row: r, col: c });
      if (target) {
        if (target.color !== piece.color) result.push({ row: r, col: c });
        break;
      }
      result.push({ row: r, col: c });
      r += dr; c += dc;
    }
  }
  return result;
}

export function knightSquares(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  const { row, col } = piece.position;
  return ([[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as [number,number][])
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(p => inBounds(p.row, p.col) && getPieceAt(state, p)?.color !== piece.color);
}

export function kingSquaresNoCastle(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  const { row, col } = piece.position;
  return ALL_DIRS
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(p => inBounds(p.row, p.col) && getPieceAt(state, p)?.color !== piece.color);
}

export function pawnAttacks(piece: Piece): Position[] {
  const dir = piece.color === 'white' ? -1 : 1;
  const { row, col } = piece.position;
  return ([-1, 1] as const)
    .map(dc => ({ row: row + dir, col: col + dc }))
    .filter(p => inBounds(p.row, p.col));
}
