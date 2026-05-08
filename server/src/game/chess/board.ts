// Board initialization — creates the standard chess starting position.

import { GameConfig, GameState, Piece, PieceType, Color } from '@hexchess/shared';

export function initGameState(config: GameConfig): GameState {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const pieces: Record<string, Piece> = {};

  function place(id: string, type: PieceType, color: Color, row: number, col: number): void {
    pieces[id] = {
      id, type, color, position: { row, col },
      upgrades: [], hasMoved: false,
      triggerCount: 0, triggered: false,
      // V3: ability effect state — all inactive at start
      anchorTurnsRemaining: 0,
      phantomNoCapture: false,
      berserkExposedTurns: 0,
      surgeExposed: false,
    };
    board[row][col] = id;
  }

  const backRank: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

  for (let c = 0; c < 8; c++) {
    place(`b_${backRank[c]}_${c}`, backRank[c], 'black', 0, c);
    place(`b_pawn_${c}`, 'pawn', 'black', 1, c);
    place(`w_pawn_${c}`, 'pawn', 'white', 6, c);
    place(`w_${backRank[c]}_${c}`, backRank[c], 'white', 7, c);
  }

  return {
    board,
    pieces,
    currentTurn: 'white',
    phase: 'waiting',
    moveNumber: 1,
    timerConfig: { moveTimerSeconds: config.moveTimerSeconds },
    enPassantTarget: null,
    halfMoveClock: 0,
    capturedPieces: { byWhite: [], byBlack: [] },
    mutationQueue: [],
    playerAbilities: { white: { hand: [] }, black: { hand: [] } },
  };
}
