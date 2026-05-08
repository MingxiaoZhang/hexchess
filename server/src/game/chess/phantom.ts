// V3 Phantom ability helper — squares reachable by passing through the first blocker on a ray.
// Kept separate because it's ability-specific and doesn't belong in core chess rules.

import { GameState, Piece, Position } from '@hexchess/shared';
import { inBounds, getPieceAt } from './helpers';

export function getPhantomReachableSquares(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  const dirs: [number, number][] =
    piece.type === 'rook'   ? [[-1,0],[1,0],[0,-1],[0,1]] :
    piece.type === 'bishop' ? [[-1,-1],[-1,1],[1,-1],[1,1]] :
    piece.type === 'queen'  ? [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] : [];

  if (dirs.length === 0) return [];

  const result: Position[] = [];
  for (const [dr, dc] of dirs) {
    let r = piece.position.row + dr;
    let c = piece.position.col + dc;
    let passedBlocker = false;

    while (inBounds(r, c)) {
      const occupant = getPieceAt(state, { row: r, col: c });
      if (occupant) {
        if (!passedBlocker) {
          passedBlocker = true; // skip the first blocker
        } else {
          if (occupant.color !== piece.color) result.push({ row: r, col: c });
          break;
        }
      } else if (passedBlocker) {
        result.push({ row: r, col: c });
      }
      r += dr; c += dc;
    }
  }
  return result;
}
