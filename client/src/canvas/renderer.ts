// Board + piece rendering. Knows nothing about networking or game rules.
// All rendering decisions are driven by the data passed in.

import { Color, GameState, Piece, Position } from '@hexchess/shared';
import {
  drawAndUpdateParticles,
  drawFlash,
  getShakeOffset,
} from './effects';
import { getAnimationProgress } from './animations';

// ---- Visual constants ----
const DARK_SQUARE   = '#4a4a4a';
const LIGHT_SQUARE  = '#e8d5b0';
const SELECT_COLOR  = 'rgba(255, 215, 0, 0.55)';
const VALID_COLOR   = 'rgba(255, 215, 0, 0.35)';
const LAST_MOVE_COL = 'rgba(100, 200, 100, 0.3)';
const ATOMIC_GLOW   = 'rgba(255, 60, 60, 0.4)';
const WHITE_GLOW    = 'rgba(200, 220, 255, 0.25)';
const BLACK_GLOW    = 'rgba(255, 180, 50, 0.25)';

// Piece image cache
const imageCache = new Map<string, HTMLImageElement>();

export function loadPieceImages(): Promise<void> {
  const keys = ['wP','wR','wN','wB','wQ','wK','bP','bR','bN','bB','bQ','bK'];
  return Promise.all(keys.map(k => new Promise<void>((resolve) => {
    const img = new Image();
    img.src = `/pieces/${k}.svg`;
    img.onload = () => { imageCache.set(k, img); resolve(); };
    img.onerror = () => resolve(); // don't hard-fail if an SVG is missing
  }))).then(() => undefined);
}

function pieceImageKey(piece: Piece): string {
  const colorChar = piece.color === 'white' ? 'w' : 'b';
  const typeChar: Record<string, string> = {
    pawn: 'P', rook: 'R', knight: 'N', bishop: 'B', queen: 'Q', king: 'K',
  };
  return `${colorChar}${typeChar[piece.type]}`;
}

// ---- Coordinate transforms ----

export function boardToCanvas(pos: Position, squareSize: number, myColor: Color): { x: number; y: number } {
  const row = myColor === 'white' ? pos.row : 7 - pos.row;
  const col = myColor === 'white' ? pos.col : 7 - pos.col;
  return { x: col * squareSize, y: row * squareSize };
}

export function canvasToBoard(
  cx: number, cy: number, squareSize: number, myColor: Color
): Position {
  const col = Math.floor(cx / squareSize);
  const row = Math.floor(cy / squareSize);
  if (myColor === 'white') return { row, col };
  return { row: 7 - row, col: 7 - col };
}

// ---- Board drawing ----

function drawBoard(ctx: CanvasRenderingContext2D, squareSize: number): void {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      ctx.fillStyle = (r + c) % 2 === 0 ? LIGHT_SQUARE : DARK_SQUARE;
      ctx.fillRect(c * squareSize, r * squareSize, squareSize, squareSize);
    }
  }
}

function drawHighlights(
  ctx: CanvasRenderingContext2D,
  squareSize: number,
  myColor: Color,
  selectedPieceId: string | null,
  validMoves: Position[],
  lastMove: Position[] // [from, to] of last move
): void {
  // Last move highlight
  for (const pos of lastMove) {
    const { x, y } = boardToCanvas(pos, squareSize, myColor);
    ctx.fillStyle = LAST_MOVE_COL;
    ctx.fillRect(x, y, squareSize, squareSize);
  }

  // Valid move dots / highlights
  for (const pos of validMoves) {
    const { x, y } = boardToCanvas(pos, squareSize, myColor);
    ctx.fillStyle = VALID_COLOR;
    ctx.fillRect(x, y, squareSize, squareSize);
    // Dot in center
    ctx.fillStyle = 'rgba(0,0,0,0.2)';
    ctx.beginPath();
    ctx.arc(x + squareSize / 2, y + squareSize / 2, squareSize * 0.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Selected piece square
  if (selectedPieceId) {
    // glow is drawn in drawPieces to layer correctly — just mark the square
    void selectedPieceId;
  }
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  x: number,
  y: number,
  squareSize: number,
  isSelected: boolean,
  glowPhase: number // 0-1 for idle pulse
): void {
  const pad = squareSize * 0.07;
  const sz = squareSize - pad * 2;

  // Idle glow
  const glowColor = piece.color === 'white' ? WHITE_GLOW : BLACK_GLOW;
  const glowAlpha = 0.15 + 0.1 * Math.sin(glowPhase * Math.PI * 2);
  ctx.save();
  ctx.globalAlpha = glowAlpha;
  ctx.fillStyle = glowColor;
  ctx.beginPath();
  ctx.arc(x + squareSize / 2, y + squareSize / 2, squareSize * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Atomic upgrade aura
  if (piece.upgrades.some(u => u.id === 'atomic')) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.2 * Math.sin(glowPhase * Math.PI * 2);
    ctx.fillStyle = ATOMIC_GLOW;
    ctx.beginPath();
    ctx.arc(x + squareSize / 2, y + squareSize / 2, squareSize * 0.48, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Selected highlight ring
  if (isSelected) {
    ctx.save();
    ctx.strokeStyle = SELECT_COLOR;
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, squareSize - 4, squareSize - 4);
    ctx.fillStyle = SELECT_COLOR;
    ctx.fillRect(x, y, squareSize, squareSize);
    ctx.restore();
  }

  // Piece image or fallback
  const key = pieceImageKey(piece);
  const img = imageCache.get(key);
  if (img) {
    ctx.drawImage(img, x + pad, y + pad, sz, sz);
  } else {
    // Unicode fallback
    const symbols: Record<string, string> = {
      wP:'♙', wR:'♖', wN:'♘', wB:'♗', wQ:'♕', wK:'♔',
      bP:'♟', bR:'♜', bN:'♞', bB:'♝', bQ:'♛', bK:'♚',
    };
    ctx.save();
    ctx.font = `${squareSize * 0.7}px serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = piece.color === 'white' ? '#fff' : '#000';
    ctx.fillText(symbols[key] ?? '?', x + squareSize / 2, y + squareSize / 2);
    ctx.restore();
  }
}

// ---- File / rank labels ----

function drawLabels(ctx: CanvasRenderingContext2D, squareSize: number, myColor: Color): void {
  const files = 'abcdefgh';
  const ranks = '87654321';
  ctx.font = `${squareSize * 0.18}px sans-serif`;
  ctx.textBaseline = 'bottom';

  for (let i = 0; i < 8; i++) {
    const c = myColor === 'white' ? i : 7 - i;
    const r = myColor === 'white' ? i : 7 - i;

    // File labels (bottom edge of each column)
    ctx.fillStyle = (i % 2 === 0) ? DARK_SQUARE : LIGHT_SQUARE;
    ctx.textAlign = 'right';
    ctx.fillText(files[c], (i + 1) * squareSize - 2, 8 * squareSize - 2);

    // Rank labels (left edge of each row)
    ctx.fillStyle = (i % 2 === 0) ? LIGHT_SQUARE : DARK_SQUARE;
    ctx.textAlign = 'left';
    ctx.fillText(ranks[r], 2, (i + 1) * squareSize - 2);
  }
}

// ---- Main render function ----

let glowPhase = 0;

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvasWrapper: HTMLDivElement,
  gameState: GameState,
  myColor: Color,
  selectedPieceId: string | null,
  validMoves: Position[]
): void {
  const squareSize = ctx.canvas.width / 8;

  // Shake: apply to the wrapper div
  const { dx, dy } = getShakeOffset();
  canvasWrapper.style.transform = dx !== 0 || dy !== 0
    ? `translate(${dx}px, ${dy}px)`
    : '';

  glowPhase = (glowPhase + 0.005) % 1;

  // Clear
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  // Board
  drawBoard(ctx, squareSize);

  // Last move squares
  const lastMovePosns: Position[] = [];
  if (gameState.lastMove) {
    lastMovePosns.push(gameState.lastMove.from, gameState.lastMove.to);
  }
  drawHighlights(ctx, squareSize, myColor, selectedPieceId, validMoves, lastMovePosns);

  // Labels
  drawLabels(ctx, squareSize, myColor);

  // Pieces
  const toCanvas = (pos: Position) => boardToCanvas(pos, squareSize, myColor);
  const anim = getAnimationProgress(toCanvas);

  for (const piece of Object.values(gameState.pieces)) {
    const isAnimated = anim && anim.pieceId === piece.id;
    const x = isAnimated ? anim.x : toCanvas(piece.position).x;
    const y = isAnimated ? anim.y : toCanvas(piece.position).y;
    drawPiece(ctx, piece, x, y, squareSize, piece.id === selectedPieceId, glowPhase);
  }

  // Particles and flash on top
  drawAndUpdateParticles(ctx);
  drawFlash(ctx, ctx.canvas.width, ctx.canvas.height);
}
