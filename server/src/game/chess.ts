import {
  Color,
  GameConfig,
  GameState,
  Move,
  Piece,
  PieceType,
  Position,
} from '@hexchess/shared';

// ---- Internal helpers ----

function inBounds(row: number, col: number): boolean {
  return row >= 0 && row < 8 && col >= 0 && col < 8;
}

function opponent(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

function getPieceAt(state: Pick<GameState, 'board' | 'pieces'>, pos: Position): Piece | null {
  const id = state.board[pos.row]?.[pos.col];
  return id ? state.pieces[id] ?? null : null;
}

const BISHOP_DIRS: [number, number][] = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
const ROOK_DIRS: [number, number][] = [[-1, 0], [1, 0], [0, -1], [0, 1]];
const QUEEN_DIRS: [number, number][] = [...BISHOP_DIRS, ...ROOK_DIRS];
const ALL_DIRS: [number, number][] = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function rayMoves(
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
      r += dr;
      c += dc;
    }
  }
  return result;
}

function knightSquares(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  const { row, col } = piece.position;
  const deltas: [number, number][] = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
  return deltas
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(p => inBounds(p.row, p.col) && getPieceAt(state, p)?.color !== piece.color);
}

function kingSquaresNoCastle(
  state: Pick<GameState, 'board' | 'pieces'>,
  piece: Piece
): Position[] {
  const { row, col } = piece.position;
  return ALL_DIRS
    .map(([dr, dc]) => ({ row: row + dr, col: col + dc }))
    .filter(p => inBounds(p.row, p.col) && getPieceAt(state, p)?.color !== piece.color);
}

function pawnAttacks(piece: Piece): Position[] {
  const dir = piece.color === 'white' ? -1 : 1;
  const { row, col } = piece.position;
  return ([-1, 1] as const)
    .map(dc => ({ row: row + dir, col: col + dc }))
    .filter(p => inBounds(p.row, p.col));
}

// Attack squares: squares this piece threatens (used for check detection).
// Pawns only threaten diagonals, not their forward squares.
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

export function isInCheck(state: Pick<GameState, 'board' | 'pieces'>, color: Color): boolean {
  const king = Object.values(state.pieces).find(p => p.color === color && p.type === 'king');
  if (!king) return false;
  return isSquareAttackedBy(state, king.position, opponent(color));
}

// ---- Pseudo-legal move generation (ignores check) ----

function getPawnMoves(state: GameState, piece: Piece): Position[] {
  const { row, col } = piece.position;
  const dir = piece.color === 'white' ? -1 : 1;
  const startRow = piece.color === 'white' ? 6 : 1;
  const result: Position[] = [];

  // Forward 1
  if (inBounds(row + dir, col) && !getPieceAt(state, { row: row + dir, col })) {
    result.push({ row: row + dir, col });
    // Forward 2 from start
    if (row === startRow && !getPieceAt(state, { row: row + 2 * dir, col })) {
      result.push({ row: row + 2 * dir, col });
    }
  }

  // Diagonal captures and en passant
  for (const dc of [-1, 1]) {
    const nr = row + dir;
    const nc = col + dc;
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

  // Cannot castle while in check
  if (isInCheck(state, piece.color)) return [];

  // Kingside (col 6): squares 5 and 6 must be empty and unattacked
  const ksRookId = state.board[row][7];
  const ksRook = ksRookId ? state.pieces[ksRookId] : null;
  if (ksRook?.type === 'rook' && !ksRook.hasMoved &&
      !state.board[row][5] && !state.board[row][6] &&
      !isSquareAttackedBy(state, { row, col: 5 }, opp) &&
      !isSquareAttackedBy(state, { row, col: 6 }, opp)) {
    result.push({ row, col: 6 });
  }

  // Queenside (col 2): squares 1, 2, 3 empty; 2 and 3 unattacked
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

// ---- Move simulation (for legality filtering) ----

// Applies a move without full state tracking — used only to check resulting check status.
function simulateMove(state: GameState, piece: Piece, to: Position): Pick<GameState, 'board' | 'pieces'> {
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
    // Attacker explodes: remove attacker, captured piece, and all adjacent pieces.
    // Kings are no longer excluded — a king caught in the blast dies instantly.
    board[row][col] = null;
    if (capturedId) {
      if (isEnPassant) {
        const epRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
        board[epRow][to.col] = null;
      } else {
        board[to.row][to.col] = null;
      }
      delete pieces[capturedId];
    }
    delete pieces[piece.id];
    // Explosion center is the target square
    for (const [dr, dc] of ALL_DIRS) {
      const ar = to.row + dr;
      const ac = to.col + dc;
      if (!inBounds(ar, ac)) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      delete pieces[adjId];
    }
  } else {
    // En passant capture
    if (isEnPassant && capturedId) {
      const epRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
      board[epRow][to.col] = null;
      delete pieces[capturedId];
    }

    // Castling: move rook
    if (piece.type === 'king' && Math.abs(to.col - col) === 2) {
      if (to.col === 6) {
        const rookId = board[row][7];
        if (rookId) { board[row][7] = null; board[row][5] = rookId; pieces[rookId] = { ...pieces[rookId], position: { row, col: 5 } }; }
      } else {
        const rookId = board[row][0];
        if (rookId) { board[row][0] = null; board[row][3] = rookId; pieces[rookId] = { ...pieces[rookId], position: { row, col: 3 } }; }
      }
    }

    // Normal capture or empty square move
    const normalCaptureId = board[to.row][to.col];
    if (normalCaptureId && !isEnPassant) delete pieces[normalCaptureId];

    board[row][col] = null;
    board[to.row][to.col] = piece.id;
    pieces[piece.id] = { ...pieces[piece.id], position: to };
  }

  return { board, pieces };
}

// ---- Public API ----

export function getValidMoves(state: GameState, pieceId: string): Position[] {
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== state.currentTurn) return [];

  const pseudoMoves = getPseudoLegalMoves(state, piece);
  return pseudoMoves.filter(to => {
    const sim = simulateMove(state, piece, to);
    // If own king was caught in an Atomic blast, the move is illegal
    const ownKingExists = Object.values(sim.pieces).some(
      p => p.color === piece.color && p.type === 'king'
    );
    if (!ownKingExists) return false;
    return !isInCheck(sim, piece.color);
  });
}

export function hasAnyLegalMove(state: GameState, color: Color): boolean {
  // Temporarily set currentTurn so getValidMoves includes this color's pieces
  const tempState = { ...state, currentTurn: color };
  return Object.values(state.pieces)
    .filter(p => p.color === color)
    .some(p => getValidMoves(tempState, p.id).length > 0);
}

export function isCheckmate(state: GameState, color: Color): boolean {
  return isInCheck(state, color) && !hasAnyLegalMove(state, color);
}

export function isStalemate(state: GameState, color: Color): boolean {
  return !isInCheck(state, color) && !hasAnyLegalMove(state, color);
}

// Applies a validated move and returns the new game state plus the move record.
// Assumes the move is already validated (caller must call getValidMoves first).
export function applyMove(
  state: GameState,
  pieceId: string,
  to: Position
): { newState: GameState; move: Move; promotionNeeded: boolean } {
  const piece = state.pieces[pieceId];
  const { row, col } = piece.position;

  // Deep clone mutable parts
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

    // Remove captured piece
    if (normalCapturedId) {
      board[to.row][to.col] = null;
      atomicDestroyedIds.push(normalCapturedId);
    }
    if (epCapturedId) {
      board[epCapturedRow][to.col] = null;
      atomicDestroyedIds.push(epCapturedId);
    }

    // Destroy pieces adjacent to the explosion center (target square).
    // Kings are no longer excluded — a king adjacent to the blast dies.
    for (const [dr, dc] of ALL_DIRS) {
      const ar = to.row + dr;
      const ac = to.col + dc;
      if (!inBounds(ar, ac)) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      atomicDestroyedIds.push(adjId);
    }

    // Remove attacker from its original square
    board[row][col] = null;
    atomicDestroyedIds.push(pieceId);

    // Clean up pieces map
    for (const id of atomicDestroyedIds) delete pieces[id];

    move.capturedPieceId = capturedId;
    move.atomicDestroyedIds = atomicDestroyedIds;
    move.isEnPassant = isEnPassant;
  } else {
    // Standard move

    // En passant
    if (isEnPassant && epCapturedId) {
      board[epCapturedRow][to.col] = null;
      const epPiece = state.pieces[epCapturedId];
      if (epPiece) {
        capturedPieces[piece.color === 'white' ? 'byWhite' : 'byBlack'].push({ ...epPiece });
      }
      move.capturedPieceId = epCapturedId;
      move.isEnPassant = true;
    }

    // Castling: also move the rook
    if (piece.type === 'king' && Math.abs(to.col - col) === 2) {
      move.isCastle = true;
      if (to.col === 6) { // kingside
        const rookId = board[row][7]!;
        board[row][7] = null;
        board[row][5] = rookId;
        pieces[rookId] = { ...pieces[rookId], position: { row, col: 5 }, hasMoved: true };
      } else { // queenside
        const rookId = board[row][0]!;
        board[row][0] = null;
        board[row][3] = rookId;
        pieces[rookId] = { ...pieces[rookId], position: { row, col: 3 }, hasMoved: true };
      }
    }

    // Normal capture
    if (normalCapturedId) {
      const capPiece = state.pieces[normalCapturedId];
      if (capPiece) {
        capturedPieces[piece.color === 'white' ? 'byWhite' : 'byBlack'].push({ ...capPiece });
      }
      move.capturedPieceId = normalCapturedId;
      delete pieces[normalCapturedId];
    }

    // Move piece
    board[row][col] = null;
    board[to.row][to.col] = pieceId;
    pieces[pieceId] = { ...pieces[pieceId], position: to, hasMoved: true };
  }

  // Update en passant target (set only after a pawn double push)
  let enPassantTarget: Position | null = null;
  if (!isAtomicCapture && piece.type === 'pawn' && Math.abs(to.row - row) === 2) {
    const epRow = piece.color === 'white' ? to.row + 1 : to.row - 1;
    enPassantTarget = { row: epRow, col: to.col };
  }

  // Pawn promotion check (only for non-atomic; atomic attacker is gone)
  const promotionRow = piece.color === 'white' ? 0 : 7;
  const promotionNeeded =
    !isAtomicCapture &&
    piece.type === 'pawn' &&
    to.row === promotionRow;

  if (promotionNeeded) {
    move.isPromotion = true;
  }

  const halfMoveClock =
    piece.type === 'pawn' || !!capturedId || isAtomicCapture
      ? 0
      : state.halfMoveClock + 1;

  const nextTurn: Color = opponent(piece.color);
  const moveNumber = state.moveNumber + (piece.color === 'black' ? 1 : 0);

  const newState: GameState = {
    ...state,
    board,
    pieces,
    currentTurn: nextTurn,
    phase: state.phase, // caller handles phase changes
    moveNumber,
    enPassantTarget,
    halfMoveClock,
    capturedPieces,
    lastMove: move,
  };

  return { newState, move, promotionNeeded };
}

// Apply pawn promotion: change piece type and optionally add an upgrade.
export function applyPromotion(
  state: GameState,
  pieceId: string,
  newType: PieceType,
  upgrade: { id: string; name: string; description: string } | null
): GameState {
  const piece = state.pieces[pieceId];
  if (!piece) return state;

  const upgrades = upgrade
    ? [...piece.upgrades, { id: upgrade.id, name: upgrade.name, description: upgrade.description, usesRemaining: null }]
    : [...piece.upgrades];

  const pieces = {
    ...state.pieces,
    [pieceId]: { ...piece, type: newType, upgrades },
  };

  return { ...state, pieces };
}

// ---- Board initialization ----

export function initGameState(config: GameConfig): GameState {
  const board: (string | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  const pieces: Record<string, Piece> = {};

  function place(id: string, type: PieceType, color: Color, row: number, col: number): void {
    pieces[id] = {
      id, type, color, position: { row, col },
      upgrades: [], hasMoved: false,
      triggerCount: 0, triggered: false,
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
  };
}
