// Config-driven ability resolution. Each ability validates + applies its own effect.
// Adding a new ability = add a config entry in config.ts and a case here.

import { AbilityId, AbilityPending, Color, GameState, Piece, Position } from '@hexchess/shared';
import { ABILITY_CONFIGS, ABILITY_POOL, GAME_CONFIG } from '../config';
import { getAttackSquares, getPhantomReachableSquares, getValidMoves } from './chess';

// ---- Ability draw ----

export function drawAbilityHand(count: number): import('@hexchess/shared').AbilityCard[] {
  // Sample without replacement from the pool (each player gets up to `count` unique abilities)
  const shuffled = [...ABILITY_POOL].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length)).map(id => ({
    id,
    usesRemaining: ABILITY_CONFIGS[id].maxUses,
  }));
}

// ---- Helpers ----

function getPlayerAbilities(state: GameState, color: Color) {
  return state.playerAbilities[color];
}

function hasAbilityWithUses(state: GameState, color: Color, abilityId: AbilityId): boolean {
  const hand = getPlayerAbilities(state, color).hand;
  const card = hand.find(c => c.id === abilityId);
  if (!card) return false;
  return card.usesRemaining === null || card.usesRemaining > 0;
}

function consumeAbility(state: GameState, color: Color, abilityId: AbilityId): GameState {
  const hand = getPlayerAbilities(state, color).hand.map(c => {
    if (c.id !== abilityId) return c;
    return { ...c, usesRemaining: c.usesRemaining === null ? null : c.usesRemaining - 1 };
  });
  return {
    ...state,
    playerAbilities: {
      ...state.playerAbilities,
      [color]: { ...state.playerAbilities[color], hand, lastUsedAbilityId: abilityId },
    },
  };
}

function pawnDirection(color: Color): number {
  return color === 'white' ? -1 : 1;
}

// ---- Outcome type ----

export interface AbilityOutcome {
  newState: GameState;
  // true when the ability ends the turn (most abilities do)
  turnEnds: boolean;
  // set when a follow-up action is required (berserk second capture, echo)
  abilityPending?: AbilityPending;
}

// ---- Main dispatcher ----

export function applyAbility(
  state: GameState,
  abilityId: AbilityId,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!hasAbilityWithUses(state, actingColor, abilityId)) return null;

  switch (abilityId) {
    case 'berserk':    return applyBerserk(state, pieceId, targetPos, actingColor);
    case 'long_strike': return applyLongStrike(state, pieceId, targetPos, actingColor);
    case 'phantom':    return applyPhantom(state, pieceId, targetPos, actingColor);
    case 'anchor':     return applyAnchor(state, pieceId, actingColor);
    case 'echo':       return applyEcho(state, actingColor);
    case 'surge':      return applySurge(state, pieceId, targetPos, actingColor);
    default: return null;
  }
}

// ---- Berserk ----
// First capture. If a valid second target exists, enter ability_pending (berserk).

export function applyBerserk(
  state: GameState,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!pieceId || !targetPos) return null;
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;

  // Validate: targetPos must be a valid capture for this piece
  const validMoves = getValidMoves(state, pieceId);
  const canCapture = validMoves.some(m => m.row === targetPos.row && m.col === targetPos.col);
  if (!canCapture) return null;

  const targetId = state.board[targetPos.row][targetPos.col];
  if (!targetId || state.pieces[targetId]?.color === actingColor) return null; // must capture an enemy

  // Apply the capture (use the standard chess move machinery via a minimal capture)
  const board = state.board.map(r => [...r]);
  const pieces = { ...state.pieces };

  // Handle Atomic on Berserk capture
  const hasAtomic = piece.upgrades.some(u => u.id === 'atomic');
  let atomicDestroyedIds: string[] = [];

  if (hasAtomic) {
    board[piece.position.row][piece.position.col] = null;
    board[targetPos.row][targetPos.col] = null;
    atomicDestroyedIds = [targetId, pieceId];
    delete pieces[targetId];
    delete pieces[pieceId];
    // Explosion adjacency
    const ALL_DIRS: [number,number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of ALL_DIRS) {
      const ar = targetPos.row + dr; const ac = targetPos.col + dc;
      if (ar < 0 || ar > 7 || ac < 0 || ac > 7) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      atomicDestroyedIds.push(adjId);
      delete pieces[adjId];
    }
    // Atomic Berserk ends the turn (attacker is gone)
    const afterState = consumeAbility({ ...state, board, pieces }, actingColor, 'berserk');
    return { newState: afterState, turnEnds: true };
  }

  // Normal capture
  board[piece.position.row][piece.position.col] = null;
  board[targetPos.row][targetPos.col] = pieceId;
  delete pieces[targetId];
  pieces[pieceId] = { ...piece, position: targetPos, hasMoved: true };

  const afterCapture = consumeAbility({ ...state, board, pieces }, actingColor, 'berserk');

  // Check for valid second capture targets
  const updatedPiece = afterCapture.pieces[pieceId];
  if (!updatedPiece) return { newState: afterCapture, turnEnds: true };

  // Temporarily set currentTurn for getValidMoves to work
  const tempState = { ...afterCapture, currentTurn: actingColor };
  const secondMoves = getValidMoves(tempState, pieceId).filter(m => {
    const id = afterCapture.board[m.row]?.[m.col];
    return id && afterCapture.pieces[id]?.color !== actingColor;
  });

  if (secondMoves.length === 0) {
    return { newState: afterCapture, turnEnds: true };
  }

  // Enter berserk pending for second capture
  const pendingState: GameState = {
    ...afterCapture,
    phase: 'ability_pending',
    abilityPending: { type: 'berserk', pieceId, pieceColor: actingColor, validTargets: secondMoves },
  };
  return { newState: pendingState, turnEnds: false, abilityPending: pendingState.abilityPending };
}

// Resolves the Berserk SECOND capture. Called from state.ts when a make_move arrives in ability_pending/berserk.
export function applyBerserkSecondCapture(
  state: GameState,
  pieceId: string,
  targetPos: Position,
  actingColor: Color
): AbilityOutcome | null {
  if (state.phase !== 'ability_pending' || state.abilityPending?.type !== 'berserk') return null;
  if (state.abilityPending.pieceId !== pieceId || state.abilityPending.pieceColor !== actingColor) return null;

  const validTargets = state.abilityPending.validTargets;
  if (!validTargets.some(t => t.row === targetPos.row && t.col === targetPos.col)) return null;

  const piece = state.pieces[pieceId];
  if (!piece) return null;

  const board = state.board.map(r => [...r]);
  const pieces = { ...state.pieces };

  const targetId = board[targetPos.row][targetPos.col];
  if (targetId) delete pieces[targetId];

  board[piece.position.row][piece.position.col] = null;
  board[targetPos.row][targetPos.col] = pieceId;
  pieces[pieceId] = { ...piece, position: targetPos, hasMoved: true, berserkExposedTurns: 1 };

  const nextTurn: Color = actingColor === 'white' ? 'black' : 'white';
  const newState: GameState = {
    ...state,
    board,
    pieces,
    phase: 'active',
    abilityPending: undefined,
    currentTurn: nextTurn,
  };
  return { newState, turnEnds: true };
}

// ---- Long Strike ----
// Remove an enemy piece in attack range without moving. Supports Atomic.

function applyLongStrike(
  state: GameState,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!pieceId || !targetPos) return null;
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;

  const targetId = state.board[targetPos.row]?.[targetPos.col];
  if (!targetId) return null;
  const target = state.pieces[targetId];
  if (!target || target.color === actingColor) return null;

  // Validate: piece must be able to attack targetPos
  const attackSquares = getAttackSquares(state, piece);
  if (!attackSquares.some(s => s.row === targetPos.row && s.col === targetPos.col)) return null;

  const board = state.board.map(r => [...r]);
  const pieces = { ...state.pieces };

  const hasAtomic = piece.upgrades.some(u => u.id === 'atomic');

  if (hasAtomic) {
    // Long Strike + Atomic: explosion at targetPos, attacker stays
    board[targetPos.row][targetPos.col] = null;
    delete pieces[targetId];
    const ALL_DIRS: [number,number][] = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
    for (const [dr, dc] of ALL_DIRS) {
      const ar = targetPos.row + dr; const ac = targetPos.col + dc;
      if (ar < 0 || ar > 7 || ac < 0 || ac > 7) continue;
      const adjId = board[ar][ac];
      if (!adjId || !pieces[adjId]) continue;
      board[ar][ac] = null;
      delete pieces[adjId];
    }
  } else {
    board[targetPos.row][targetPos.col] = null;
    delete pieces[targetId];
  }

  const capturedPieces = { ...state.capturedPieces };
  if (actingColor === 'white') capturedPieces.byWhite = [...capturedPieces.byWhite, target];
  else capturedPieces.byBlack = [...capturedPieces.byBlack, target];

  const newState = consumeAbility(
    { ...state, board, pieces, capturedPieces },
    actingColor,
    'long_strike'
  );
  // Record that this ability was used with this target for Echo
  newState.playerAbilities[actingColor].lastUsedPieceId = pieceId;
  newState.playerAbilities[actingColor].lastUsedTargetPos = targetPos;

  return { newState, turnEnds: true };
}

// ---- Phantom ----
// Move through the first blocker on a ray. Cannot capture next turn.

function applyPhantom(
  state: GameState,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!pieceId || !targetPos) return null;
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;

  // Cannot phantom if anchored
  if (piece.anchorTurnsRemaining > 0) return null;

  const reachable = getPhantomReachableSquares(state, piece);
  if (!reachable.some(s => s.row === targetPos.row && s.col === targetPos.col)) return null;

  const board = state.board.map(r => [...r]);
  const pieces = { ...state.pieces };

  // Capture at destination if enemy is there
  const targetId = board[targetPos.row][targetPos.col];
  if (targetId && pieces[targetId]?.color !== actingColor) {
    delete pieces[targetId];
  }

  board[piece.position.row][piece.position.col] = null;
  board[targetPos.row][targetPos.col] = pieceId;
  pieces[pieceId] = { ...piece, position: targetPos, hasMoved: true, phantomNoCapture: true };

  const newState = consumeAbility({ ...state, board, pieces }, actingColor, 'phantom');
  newState.playerAbilities[actingColor].lastUsedPieceId = pieceId;
  newState.playerAbilities[actingColor].lastUsedTargetPos = targetPos;

  return { newState, turnEnds: true };
}

// ---- Anchor ----
// Selected piece cannot be captured or move for 2 of the owning player's turns.

function applyAnchor(
  state: GameState,
  pieceId: string | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!pieceId) return null;
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor) return null;
  if (piece.anchorTurnsRemaining > 0) return null; // already anchored
  if (piece.berserkExposedTurns > 0) return null;  // exposed pieces can't be anchored

  const pieces = {
    ...state.pieces,
    [pieceId]: { ...piece, anchorTurnsRemaining: 2 },
  };

  const newState = consumeAbility({ ...state, pieces }, actingColor, 'anchor');
  newState.playerAbilities[actingColor].lastUsedPieceId = pieceId;

  return { newState, turnEnds: true };
}

// ---- Echo ----
// Copy the opponent's last ability and use it now (enter echo_pending).

function applyEcho(
  state: GameState,
  actingColor: Color
): AbilityOutcome | null {
  const opponent: Color = actingColor === 'white' ? 'black' : 'white';
  const copiedAbilityId = state.playerAbilities[opponent].lastUsedAbilityId;
  if (!copiedAbilityId) return null; // opponent hasn't used any ability yet

  const afterConsume = consumeAbility(state, actingColor, 'echo');

  const pendingState: GameState = {
    ...afterConsume,
    phase: 'ability_pending',
    abilityPending: { type: 'echo', copiedAbilityId, pieceColor: actingColor },
  };
  return { newState: pendingState, turnEnds: false, abilityPending: pendingState.abilityPending };
}

// Resolves an Echo: apply the copied ability as a free use.
export function applyEchoAbility(
  state: GameState,
  copiedAbilityId: AbilityId,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (state.phase !== 'ability_pending' || state.abilityPending?.type !== 'echo') return null;
  if (state.abilityPending.pieceColor !== actingColor) return null;
  if (state.abilityPending.copiedAbilityId !== copiedAbilityId) return null;

  // Temporarily grant a free use of the copied ability (don't check hand)
  const tempState: GameState = {
    ...state,
    phase: 'active',
    abilityPending: undefined,
    playerAbilities: {
      ...state.playerAbilities,
      [actingColor]: {
        ...state.playerAbilities[actingColor],
        hand: [
          ...state.playerAbilities[actingColor].hand,
          { id: copiedAbilityId, usesRemaining: 1 }, // free use added temporarily
        ],
      },
    },
  };

  const outcome = applyAbility(tempState, copiedAbilityId, pieceId, targetPos, actingColor);
  if (!outcome) return null;

  // Remove the temporarily added card (it was a free use)
  const cleanedHand = outcome.newState.playerAbilities[actingColor].hand.filter(
    (c, i, arr) => !(c.id === copiedAbilityId && i === arr.length - 1 && c.usesRemaining === 0)
  );

  return {
    ...outcome,
    newState: {
      ...outcome.newState,
      playerAbilities: {
        ...outcome.newState.playerAbilities,
        [actingColor]: { ...outcome.newState.playerAbilities[actingColor], hand: cleanedHand },
      },
    },
  };
}

// ---- Surge ----
// Pawn moves 1-3 squares forward. All intermediate squares must be empty. No captures.

function applySurge(
  state: GameState,
  pieceId: string | undefined,
  targetPos: Position | undefined,
  actingColor: Color
): AbilityOutcome | null {
  if (!pieceId || !targetPos) return null;
  const piece = state.pieces[pieceId];
  if (!piece || piece.color !== actingColor || piece.type !== 'pawn') return null;
  if (piece.anchorTurnsRemaining > 0) return null;

  const dir = pawnDirection(actingColor);
  const { row, col } = piece.position;

  // Must move 1-3 squares forward in same column
  const rowDiff = targetPos.row - row;
  if (targetPos.col !== col) return null;
  if (actingColor === 'white' && (rowDiff < -3 || rowDiff >= 0)) return null;
  if (actingColor === 'black' && (rowDiff > 3 || rowDiff <= 0)) return null;

  // All intermediate squares must be empty, target must be empty
  const steps = Math.abs(rowDiff);
  for (let s = 1; s <= steps; s++) {
    const r = row + s * dir;
    if (state.board[r][col]) return null; // blocked
  }

  const board = state.board.map(r => [...r]);
  const pieces = { ...state.pieces };

  board[row][col] = null;
  board[targetPos.row][targetPos.col] = pieceId;
  pieces[pieceId] = { ...piece, position: targetPos, hasMoved: true, surgeExposed: true };

  const newState = consumeAbility({ ...state, board, pieces }, actingColor, 'surge');
  newState.playerAbilities[actingColor].lastUsedPieceId = pieceId;
  newState.playerAbilities[actingColor].lastUsedTargetPos = targetPos;

  // Check for promotion (white reaching row 0, black reaching row 7)
  const promotionRow = actingColor === 'white' ? 0 : 7;
  const promotionNeeded = targetPos.row === promotionRow;

  return { newState, turnEnds: !promotionNeeded };
}

// ---- Tick ability states ----
// Called after every completed turn to advance timers on ability effects.

export function tickAbilityStates(state: GameState, justMoved: Color): GameState {
  const opponent: Color = justMoved === 'white' ? 'black' : 'white';
  const pieces = { ...state.pieces };

  for (const piece of Object.values(state.pieces)) {
    if (piece.color === justMoved) {
      // Owning player just moved — advance their pieces' own-turn timers
      const updates: Partial<Piece> = {};
      if (piece.anchorTurnsRemaining > 0) updates.anchorTurnsRemaining = piece.anchorTurnsRemaining - 1;
      if (piece.phantomNoCapture) updates.phantomNoCapture = false;
      if (Object.keys(updates).length > 0) pieces[piece.id] = { ...piece, ...updates };
    } else if (piece.color === opponent) {
      // Opponent's pieces: exposure expires after one opponent move
      const updates: Partial<Piece> = {};
      if (piece.berserkExposedTurns > 0) updates.berserkExposedTurns = piece.berserkExposedTurns - 1;
      if (piece.surgeExposed) updates.surgeExposed = false;
      if (Object.keys(updates).length > 0) pieces[piece.id] = { ...piece, ...updates };
    }
  }

  return { ...state, pieces };
}

// Expose ability configs for the client
export { ABILITY_CONFIGS };

// Suppress unused import
void GAME_CONFIG;
