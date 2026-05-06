import { useEffect, useRef, useCallback } from 'react';
import { Color, GameState, Position } from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';
import { makeMove, onMoveResult, useAbility } from '../socket/client';
import { HUD } from './HUD';
import { PromotionModal } from './PromotionModal';
import { MutationModal } from './MutationModal';
import { AbilityHand } from './AbilityHand';
import { loadPieceImages, renderFrame, boardToCanvas, canvasToBoard } from '../canvas/renderer';
import { startAnimation } from '../canvas/animations';
import {
  triggerShake,
  triggerFlash,
  triggerParticles,
  SHAKE_CONFIG,
} from '../canvas/effects';

interface GameScreenProps {
  gameState: GameState;
  myColor: Color;
}

export function GameScreen({ gameState, myColor }: GameScreenProps): JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const animFrameRef = useRef<number>(0);
  const imagesLoaded = useRef(false);

  const selectedPieceId = useGameStore(s => s.selectedPieceId);
  const validMoves = useGameStore(s => s.validMoves);
  const { selectPiece } = useGameStore();

  // Load piece images once
  useEffect(() => {
    if (!imagesLoaded.current) {
      imagesLoaded.current = true;
      loadPieceImages();
    }
  }, []);

  // Resize canvas to match parent size (maintaining square)
  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const size = Math.min(parent.clientWidth, parent.clientHeight);
    if (canvas.width !== size) {
      canvas.width = size;
      canvas.height = size;
    }
  }, []);

  useEffect(() => {
    resizeCanvas();
    const ro = new ResizeObserver(resizeCanvas);
    if (canvasRef.current?.parentElement) ro.observe(canvasRef.current.parentElement);
    window.addEventListener('resize', resizeCanvas);
    return () => { ro.disconnect(); window.removeEventListener('resize', resizeCanvas); };
  }, [resizeCanvas]);

  // Wire move-result effects (shake, particles, flash)
  useEffect(() => {
    onMoveResult((payload) => {
      const { move, atomic, gameState: newGs } = payload;

      if (atomic) {
        const squareSize = canvasRef.current ? canvasRef.current.width / 8 : 80;
        const center = boardToCanvas(move.to, squareSize, myColor);
        triggerShake(SHAKE_CONFIG.atomic.amplitude, SHAKE_CONFIG.atomic.duration);
        triggerParticles(center.x + squareSize / 2, center.y + squareSize / 2, 30, '#ff4400');
        return;
      }

      if (move.capturedPieceId) {
        // Piece was in the state before the move
        const capturedPiece = gameState.pieces[move.capturedPieceId];
        const pieceType = capturedPiece?.type ?? 'pawn';
        const cfg = SHAKE_CONFIG[pieceType];
        if (cfg && cfg.amplitude > 0) {
          triggerShake(cfg.amplitude, cfg.duration);
        }
      }

      if (newGs.phase === 'complete' && newGs.gameOverReason === 'checkmate') {
        triggerShake(SHAKE_CONFIG.checkmate.amplitude, SHAKE_CONFIG.checkmate.duration);
        triggerFlash('rgba(255,255,255,1)', 0.5);
      }

      // Don't animate atomic moves — attacker disappears in the explosion
      if (!atomic && move.from && move.to) {
        startAnimation(move.pieceId, move.from, move.to);
      }
    });
  }, [myColor, gameState]);

  // Render loop
  useEffect(() => {
    const loop = () => {
      const canvas = canvasRef.current;
      const wrapper = wrapperRef.current;
      if (canvas && wrapper) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          renderFrame(ctx, wrapper, gameState, myColor, selectedPieceId, validMoves);
        }
      }
      animFrameRef.current = requestAnimationFrame(loop);
    };
    animFrameRef.current = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [gameState, myColor, selectedPieceId, validMoves]);

  // Click / piece selection handler — handles normal moves AND ability targeting
  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const squareSize = canvas.width / 8;
    const pos = canvasToBoard(e.clientX - rect.left, e.clientY - rect.top, squareSize, myColor);
    if (pos.row < 0 || pos.row > 7 || pos.col < 0 || pos.col > 7) return;

    const store = useGameStore.getState();
    const roomId = store.roomId;
    const selectedAbility = store.selectedAbility;
    const abilitySourcePieceId = store.abilitySourcePieceId;

    // Berserk second capture (ability_pending phase)
    if (gameState.phase === 'ability_pending' && gameState.abilityPending?.type === 'berserk') {
      if (gameState.abilityPending.pieceColor !== myColor) return;
      const validTargets = gameState.abilityPending.validTargets ?? [];
      if (validTargets.some(t => t.row === pos.row && t.col === pos.col) && roomId) {
        const piece = gameState.pieces[gameState.abilityPending.pieceId];
        if (piece) makeMove(roomId, piece.id, piece.position, pos);
      }
      return;
    }

    if (gameState.phase !== 'active') return;
    if (gameState.currentTurn !== myColor) return;

    // Ability mode: click source piece then target
    if (selectedAbility && selectedAbility !== 'echo') {
      if (!abilitySourcePieceId) {
        // Step 1: choose source piece
        const cellId = gameState.board[pos.row]?.[pos.col];
        if (cellId && gameState.pieces[cellId]?.color === myColor) {
          store.setAbilitySourcePiece(cellId);
          selectPiece(cellId, computeValidMovesClient(gameState, cellId));
        }
        return;
      }
      // Step 2: choose target
      if (roomId) useAbility(roomId, selectedAbility, abilitySourcePieceId, pos);
      selectPiece(null, []);
      return;
    }

    // Normal move: valid-move target
    if (selectedPieceId) {
      const isValidTarget = validMoves.some(m => m.row === pos.row && m.col === pos.col);
      if (isValidTarget) {
        const piece = gameState.pieces[selectedPieceId];
        if (piece && roomId) { makeMove(roomId, selectedPieceId, piece.position, pos); selectPiece(null, []); }
        return;
      }
    }

    // Select a friendly piece
    const cellId = gameState.board[pos.row]?.[pos.col];
    if (cellId) {
      const piece = gameState.pieces[cellId];
      if (piece && piece.color === myColor) {
        if (selectedPieceId === cellId) selectPiece(null, []);
        else selectPiece(cellId, computeValidMovesClient(gameState, cellId));
        return;
      }
    }

    selectPiece(null, []);
  }, [gameState, myColor, selectedPieceId, validMoves, selectPiece]);

  const promotionPending = useGameStore(s => s.promotionPending);
  const mutationPending = useGameStore(s => s.mutationPending);
  const mutationToast = useGameStore(s => s.mutationToast);
  const vsAI = useGameStore(s => s.vsAI);
  const winner = gameState.winner;
  const reason = gameState.gameOverReason;

  return (
    <div style={styles.root}>
      {/* Board area */}
      <div style={styles.boardArea}>
        <div ref={wrapperRef} style={styles.canvasWrapper}>
          <canvas
            ref={canvasRef}
            style={styles.canvas}
            onClick={handleCanvasClick}
          />
        </div>
      </div>

      {/* Side panel */}
      <div style={styles.sidebar}>
        <HUD myColor={myColor} vsAI={vsAI} />

        {/* V3: Ability cards — always visible during the game */}
        {gameState.playerAbilities && (
          <>
            <AbilityHand
              hand={gameState.playerAbilities[myColor]?.hand ?? []}
              myColor={myColor}
              isMyTurn={gameState.currentTurn === myColor && (gameState.phase === 'active' || gameState.phase === 'ability_pending')}
              roomId={useGameStore.getState().roomId}
            />
            <AbilityHand
              hand={gameState.playerAbilities[myColor === 'white' ? 'black' : 'white']?.hand ?? []}
              myColor={myColor}
              isMyTurn={false}
              roomId={null}
              isOpponent
            />
          </>
        )}

        {gameState.phase === 'complete' && (
          <div style={styles.gameOver}>
            {winner
              ? (winner === myColor ? 'You win!' : 'You lose')
              : 'Draw'}
            {reason && <div style={styles.reason}>{reason}</div>}
          </div>
        )}
      </div>

      {/* Mutation outcome toast — shown to both players */}
      {mutationToast && (
        <div style={styles.toast}>
          {mutationToast.ownerColor === myColor ? 'Your' : "Opponent's"}{' '}
          {mutationToast.pieceType}{' '}
          {mutationToast.accepted
            ? `gained ${mutationToast.mutationName ?? 'a mutation'}!`
            : 'declined the mutation.'}
        </div>
      )}

      {promotionPending && <PromotionModal />}
      {mutationPending && <MutationModal />}
    </div>
  );
}

// Lightweight client-side valid-move calculation for highlighting only.
// The server is still the authoritative source — this only affects highlights.
function computeValidMovesClient(gameState: GameState, pieceId: string): Position[] {
  // Import chess logic dynamically to avoid bundling server code in client.
  // For V1, we use a simplified approach: return all squares the piece can
  // move to based on pseudo-legal logic. Server enforces legality.
  const piece = gameState.pieces[pieceId];
  if (!piece) return [];
  return getClientValidSquares(gameState, piece);
}

function getClientValidSquares(gs: GameState, piece: { type: string; color: string; position: Position; hasMoved: boolean; upgrades: unknown[] }): Position[] {
  const results: Position[] = [];
  const dir = piece.color === 'white' ? -1 : 1;
  const { row, col } = piece.position;

  function inB(r: number, c: number) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
  function pieceAt(r: number, c: number) {
    const id = gs.board[r]?.[c];
    return id ? gs.pieces[id] : null;
  }
  function push(r: number, c: number) {
    if (!inB(r, c)) return;
    const p = pieceAt(r, c);
    if (!p || p.color !== piece.color) results.push({ row: r, col: c });
  }
  function ray(dr: number, dc: number) {
    let r = row + dr; let c = col + dc;
    while (inB(r, c)) {
      const p = pieceAt(r, c);
      if (p) { if (p.color !== piece.color) results.push({ row: r, col: c }); break; }
      results.push({ row: r, col: c });
      r += dr; c += dc;
    }
  }

  switch (piece.type) {
    case 'pawn': {
      if (!pieceAt(row + dir, col)) {
        results.push({ row: row + dir, col });
        const startRow = piece.color === 'white' ? 6 : 1;
        if (row === startRow && !pieceAt(row + 2 * dir, col)) results.push({ row: row + 2 * dir, col });
      }
      for (const dc of [-1, 1]) {
        const nr = row + dir; const nc = col + dc;
        if (!inB(nr, nc)) continue;
        const target = pieceAt(nr, nc);
        if (target && target.color !== piece.color) results.push({ row: nr, col: nc });
        if (!target && gs.enPassantTarget?.row === nr && gs.enPassantTarget?.col === nc) results.push({ row: nr, col: nc });
      }
      break;
    }
    case 'knight':
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]] as [number,number][]) push(row+dr, col+dc);
      break;
    case 'bishop':
      for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]] as [number,number][]) ray(dr, dc);
      break;
    case 'rook':
      for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) ray(dr, dc);
      break;
    case 'queen':
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as [number,number][]) ray(dr, dc);
      break;
    case 'king':
      for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]] as [number,number][]) push(row+dr, col+dc);
      // Castling hints (server will validate)
      if (!piece.hasMoved) {
        if (!gs.board[row][5] && !gs.board[row][6]) results.push({ row, col: 6 });
        if (!gs.board[row][1] && !gs.board[row][2] && !gs.board[row][3]) results.push({ row, col: 2 });
      }
      break;
  }
  return results;
}

const styles = {
  root: {
    display: 'flex',
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '20px',
    padding: '16px',
  },
  boardArea: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    flex: '0 0 auto',
    width: 'min(calc(100vh - 32px), calc(100vw - 240px))',
    height: 'min(calc(100vh - 32px), calc(100vw - 240px))',
  },
  canvasWrapper: {
    width: '100%',
    height: '100%',
    overflow: 'hidden',
  },
  canvas: {
    display: 'block',
    width: '100%',
    height: '100%',
    cursor: 'pointer',
  },
  sidebar: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    minWidth: '180px',
  },
  gameOver: {
    padding: '16px',
    background: 'rgba(20,20,35,0.9)',
    borderRadius: '8px',
    textAlign: 'center' as const,
    fontSize: '20px',
    color: '#ffd700',
    border: '1px solid #ffd700',
  },
  reason: {
    fontSize: '13px',
    color: '#aaa',
    marginTop: '6px',
    textTransform: 'capitalize' as const,
  },
  toast: {
    position: 'fixed' as const,
    top: '20px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: 'rgba(255,80,0,0.9)',
    color: '#fff',
    padding: '10px 20px',
    borderRadius: '8px',
    fontSize: '15px',
    zIndex: 900,
    pointerEvents: 'none' as const,
    textTransform: 'capitalize' as const,
  },
};
