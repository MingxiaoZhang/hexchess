// Basic AI opponent. Pursues triggers, uses abilities, demonstrates combos.
// getAIAction handles ALL game phases — ai-runner.ts calls it and dispatches the result.

import { AbilityId, Color, GameState, Piece, PieceType, Position } from '@hexchess/shared';
import { getValidMoves, getAttackSquares } from './chess';
import { applyAbility } from './abilities';

const PIECE_VALUE: Record<PieceType, number> = {
  pawn: 10, knight: 30, bishop: 30, rook: 50, queen: 90, king: 0,
};

// ---- Move scoring (V2 trigger pursuit + V3 awareness) ----

function scoreMove(state: GameState, piece: Piece, to: Position, aiColor: Color): number {
  let score = 0;

  const targetId = state.board[to.row]?.[to.col];
  if (targetId) score += PIECE_VALUE[state.pieces[targetId].type] * 2;

  if (piece.type === 'pawn' && !targetId &&
      state.enPassantTarget?.row === to.row && state.enPassantTarget?.col === to.col) {
    score += PIECE_VALUE.pawn;
  }

  if (piece.type === 'pawn' && !piece.triggered && piece.triggerCount < 1) {
    const crossedHalfway = aiColor === 'white' ? to.row <= 3 : to.row >= 4;
    if (crossedHalfway) score += 40;
    else score += (aiColor === 'white' ? piece.position.row - to.row : to.row - piece.position.row) * 3;
  }

  if (piece.type === 'knight' && !piece.triggered && targetId) {
    score += (piece.triggerCount + 1 >= 2) ? 50 : 25;
  }

  if (piece.type === 'rook' && !piece.triggered && piece.triggerCount < 1) {
    if (Object.values(state.pieces).some(p => p.type === 'rook' && p.color !== aiColor && p.position.col === to.col)) score += 40;
  }

  if (piece.type === 'queen' && !piece.triggered) {
    const oppKing = Object.values(state.pieces).find(p => p.type === 'king' && p.color !== aiColor);
    if (oppKing) {
      const dist = Math.max(Math.abs(to.row - oppKing.position.row), Math.abs(to.col - oppKing.position.col));
      score += Math.max(0, (8 - dist) * 4);
    }
  }

  score += Math.random() * 3;
  return score;
}

export interface AIMove {
  type: 'move';
  pieceId: string;
  to: Position;
}

export interface AIAbilityMove {
  type: 'ability';
  abilityId: AbilityId;
  pieceId?: string;
  targetPos?: Position;
  score: number;
}

export interface AIPromoteAction {
  type: 'promote';
  pieceId: string;
  pieceType: PieceType;
  upgradeId: string;
}

export interface AIAcceptMutationAction {
  type: 'accept_mutation';
  pieceId: string;
  mutationId: string;
}

export type AIAction = AIMove | AIAbilityMove | AIPromoteAction | AIAcceptMutationAction;

// ---- Ability scoring ----

function scoreAbility(state: GameState, abilityId: AbilityId, aiColor: Color): AIAbilityMove | null {
  const hand = state.playerAbilities[aiColor].hand;
  const card = hand.find(c => c.id === abilityId);
  if (!card) return null;
  if (card.usesRemaining !== null && card.usesRemaining <= 0) return null;

  switch (abilityId) {
    case 'surge': {
      // Use Surge on a pawn close to the halfway trigger line
      let best: AIAbilityMove | null = null;
      for (const piece of Object.values(state.pieces)) {
        if (piece.color !== aiColor || piece.type !== 'pawn' || piece.anchorTurnsRemaining > 0) continue;
        const dir = aiColor === 'white' ? -1 : 1;
        const { row, col } = piece.position;
        // Try surging to rank 5 crossing (row 3 for white, row 4 for black)
        for (let steps = 3; steps >= 1; steps--) {
          const targetRow = row + steps * dir;
          if (targetRow < 0 || targetRow > 7) continue;
          const crossesHalfway = aiColor === 'white' ? targetRow <= 3 : targetRow >= 4;
          // Verify clear path
          let clear = true;
          for (let s = 1; s <= steps; s++) {
            if (state.board[row + s * dir]?.[col]) { clear = false; break; }
          }
          if (!clear) continue;

          const score = crossesHalfway ? 80 : 20 + steps * 5; // prefer trigger-crossing surge
          if (!best || score > best.score) {
            best = { type: 'ability', abilityId: 'surge', pieceId: piece.id, targetPos: { row: targetRow, col }, score };
          }
          if (crossesHalfway) break; // found the best
        }
      }
      return best;
    }

    case 'berserk': {
      // Use Berserk on a knight that has 1 capture already (one more = trigger mutation)
      for (const piece of Object.values(state.pieces)) {
        if (piece.color !== aiColor || piece.type !== 'knight') continue;
        if (piece.triggerCount < 1) continue; // prefer knight already at 1 capture
        const moves = getValidMoves(state, piece.id);
        const captures = moves.filter(m => state.board[m.row]?.[m.col] && state.pieces[state.board[m.row][m.col]!]?.color !== aiColor);
        if (captures.length > 0) {
          return { type: 'ability', abilityId: 'berserk', pieceId: piece.id, targetPos: captures[0], score: 90 };
        }
      }
      // Also consider Berserk on any piece that can capture
      for (const piece of Object.values(state.pieces)) {
        if (piece.color !== aiColor) continue;
        const moves = getValidMoves(state, piece.id);
        const captures = moves.filter(m => state.board[m.row]?.[m.col] && state.pieces[state.board[m.row][m.col]!]?.color !== aiColor);
        if (captures.length > 0) {
          return { type: 'ability', abilityId: 'berserk', pieceId: piece.id, targetPos: captures[0], score: 40 };
        }
      }
      return null;
    }

    case 'long_strike': {
      // Strike the highest-value enemy piece in range
      let best: AIAbilityMove | null = null;
      for (const piece of Object.values(state.pieces)) {
        if (piece.color !== aiColor) continue;
        const attacks = getAttackSquares(state, piece);
        for (const sq of attacks) {
          const targetId = state.board[sq.row]?.[sq.col];
          if (!targetId) continue;
          const target = state.pieces[targetId];
          if (!target || target.color === aiColor) continue;
          const score = PIECE_VALUE[target.type] * 3;
          if (!best || score > best.score) {
            best = { type: 'ability', abilityId: 'long_strike', pieceId: piece.id, targetPos: sq, score };
          }
        }
      }
      return best;
    }

    case 'anchor': {
      // Anchor a piece that is 1 capture away from its trigger
      for (const piece of Object.values(state.pieces)) {
        if (piece.color !== aiColor || piece.anchorTurnsRemaining > 0) continue;
        if (piece.type === 'knight' && piece.triggerCount === 1) {
          return { type: 'ability', abilityId: 'anchor', pieceId: piece.id, score: 70 };
        }
        if (piece.type === 'queen' && piece.triggerCount === 1) {
          return { type: 'ability', abilityId: 'anchor', pieceId: piece.id, score: 60 };
        }
      }
      return null;
    }

    case 'echo': {
      const opp: Color = aiColor === 'white' ? 'black' : 'white';
      if (state.playerAbilities[opp].lastUsedAbilityId) {
        return { type: 'ability', abilityId: 'echo', score: 35 };
      }
      return null;
    }

    case 'phantom':
      return null; // AI won't use Phantom in V3 (complex targeting)

    default:
      return null;
  }
}

// ---- Unified AI decision (handles all game phases) ----

export function getAIAction(state: GameState, aiColor: Color): AIAction | null {
  switch (state.phase) {
    case 'active':
      if (state.currentTurn !== aiColor) return null;
      return chooseActiveAction(state, aiColor);

    case 'ability_pending': {
      const pending = state.abilityPending;
      if (!pending || pending.pieceColor !== aiColor) return null;
      const res = resolveAIAbilityPending(state, aiColor);
      if (res.type === 'berserk_capture') return { type: 'move', pieceId: res.pieceId, to: res.to };
      if (res.type === 'echo_ability') return { type: 'ability', abilityId: res.abilityId, pieceId: res.pieceId, targetPos: res.targetPos, score: 0 };
      return null; // skip
    }

    case 'promotion': {
      const pp = state.promotionPending;
      if (!pp) return null;
      const pieceColor = state.pieces[pp.pieceId]?.color;
      if (pieceColor !== aiColor) return null;
      return { type: 'promote', pieceId: pp.pieceId, pieceType: 'queen', upgradeId: pp.upgradeOptions[0]?.id ?? '' };
    }

    case 'mutation': {
      const m = state.mutationQueue[0];
      if (!m || m.ownerColor !== aiColor) return null;
      return { type: 'accept_mutation', pieceId: m.pieceId, mutationId: m.mutations[0]?.id ?? '' };
    }

    default:
      return null;
  }
}

function chooseActiveAction(state: GameState, aiColor: Color): AIAction | null {
  // Score all available ability moves
  let bestAbility: AIAbilityMove | null = null;
  for (const card of state.playerAbilities[aiColor].hand) {
    if ((card.id as string) === '?') continue;
    const scored = scoreAbility(state, card.id, aiColor);
    if (scored && (!bestAbility || scored.score > bestAbility.score)) bestAbility = scored;
  }

  // Score all regular moves
  let bestMoveScore = -Infinity;
  let bestMove: AIMove | null = null;
  for (const piece of Object.values(state.pieces)) {
    if (piece.color !== aiColor) continue;
    for (const to of getValidMoves(state, piece.id)) {
      const score = scoreMove(state, piece, to, aiColor);
      if (score > bestMoveScore) { bestMoveScore = score; bestMove = { type: 'move', pieceId: piece.id, to }; }
    }
  }

  if (bestAbility && bestAbility.score > bestMoveScore + 20) return bestAbility;
  return bestMove;
}

// Keep for callers that only need a move (backward compat)
export function chooseAIMove(state: GameState, aiColor: Color): { pieceId: string; to: Position } | null {
  const action = getAIAction(state, aiColor);
  if (!action || action.type !== 'move') return null;
  return { pieceId: action.pieceId, to: action.to };
}

// Keep chooseAIAction as alias
export const chooseAIAction = getAIAction;

// ---- AI pending ability resolution ----
// Called when the game is in ability_pending and the pending color is the AI.

export type AIAbilityPendingResolution =
  | { type: 'berserk_capture'; pieceId: string; to: Position }
  | { type: 'echo_ability'; abilityId: AbilityId; pieceId?: string; targetPos?: Position }
  | { type: 'skip' };

export function resolveAIAbilityPending(
  state: GameState,
  aiColor: Color
): AIAbilityPendingResolution {
  const pending = state.abilityPending;
  if (!pending || pending.pieceColor !== aiColor) return { type: 'skip' };

  if (pending.type === 'berserk') {
    const validTargets = pending.validTargets;
    if (!validTargets.length) return { type: 'skip' };

    // Pick highest-value capture target
    let bestTarget = validTargets[0];
    let bestValue = -1;
    for (const target of validTargets) {
      const targetId = state.board[target.row]?.[target.col];
      if (targetId) {
        const p = state.pieces[targetId];
        const v = p ? (PIECE_VALUE[p.type] ?? 0) : 0;
        if (v > bestValue) { bestValue = v; bestTarget = target; }
      }
    }
    return { type: 'berserk_capture', pieceId: pending.pieceId, to: bestTarget };
  }

  if (pending.type === 'echo') {
    const action = scoreAbility(state, pending.copiedAbilityId, aiColor);
    if (action) {
      return { type: 'echo_ability', abilityId: pending.copiedAbilityId, pieceId: action.pieceId, targetPos: action.targetPos };
    }
    return { type: 'skip' };
  }

  return { type: 'skip' };
}

export const AI_ALWAYS_ACCEPTS = true;
