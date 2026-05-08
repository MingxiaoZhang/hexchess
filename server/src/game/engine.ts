// Game orchestration layer. All action handlers + processOutcome live here.
// socket.ts delegates to these functions; ai-runner.ts calls them the same way.
// No special AI paths — the AI goes through the same handlers as a human player.

import { Server } from 'socket.io';
import {
  AbilityId,
  AbilityResultPayload,
  Color,
  GameOverPayload,
  GameStartPayload,
  MoveResultPayload,
  MutationAvailablePayload,
  MutationOutcomePayload,
  MutationPending,
  Position,
  PieceType,
  PromotionRequiredPayload,
  TimerUpdatePayload,
} from '@hexchess/shared';
import { GAME_CONFIG } from '../config';
import {
  EngineContext,
  createRoom,
  addPlayer,
  reconnectPlayer,
  getRuntime,
  getRuntimeBySocketId,
} from '../store/RoomStore';
import {
  RoomRuntime,
  PlayerRecord,
  clearTimer,
  getPlayerColor,
  getPlayerSocket,
  getOpponentColor,
  isFull,
  toGameRoom,
} from '../store/types';
import {
  handleMove,
  handleUseAbility,
  handlePromotion,
  handlePromotionTimeout,
  handleMutationAccept,
  handleMutationDecline,
  handleMutationTimeout,
  applyTimeout,
  applyDisconnectWin,
  sanitizeStateForPlayer,
  withDerivedPhase,
} from './state';
import { drawAbilityHand } from './abilities';

// ---- Broadcast helpers ----

function emitMoveResult(io: Server, room: RoomRuntime): void {
  const fallback = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
  io.to(room.id).emit('move_result', {
    gameState: room.state,
    move: room.state.lastMove ?? fallback,
    atomic: false,
    stateVersion: room.stateVersion,
  } satisfies MoveResultPayload & { stateVersion: number });
}

function broadcastGameOver(io: Server, room: RoomRuntime, winner: Color | null, reason: GameOverPayload['reason']): void {
  room.moveTimer = clearTimer(room.moveTimer);
  room.promotionTimer = clearTimer(room.promotionTimer);
  room.mutationTimer = clearTimer(room.mutationTimer);
  room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
  io.to(room.id).emit('game_over', { winner, reason } satisfies GameOverPayload);
}

function incrementVersion(room: RoomRuntime): void {
  room.stateVersion++;
}

// ---- processOutcome — single post-action dispatch ----
// Every action handler calls this after updating room.state.
// It determines what happens next based on the current game phase.

export function processOutcome(
  io: Server,
  ctx: EngineContext,
  room: RoomRuntime,
  broadcastPayload: { event: 'move_result'; move: MoveResultPayload['move']; atomic: boolean }
                  | { event: 'ability_result'; abilityId: AbilityId; ownerColor: Color }
                  | { event: 'state_update' }
): void {
  incrementVersion(room);
  ctx.store.save(toGameRoom(room));

  // Broadcast current state to all clients
  if (broadcastPayload.event === 'move_result') {
    io.to(room.id).emit('move_result', {
      gameState: room.state,
      move: broadcastPayload.move,
      atomic: broadcastPayload.atomic,
      stateVersion: room.stateVersion,
    });
  } else if (broadcastPayload.event === 'ability_result') {
    io.to(room.id).emit('ability_result', {
      gameState: room.state,
      abilityId: broadcastPayload.abilityId,
      ownerColor: broadcastPayload.ownerColor,
      stateVersion: room.stateVersion,
    } satisfies AbilityResultPayload & { stateVersion: number });
    // Also emit move_result so clients with only move_result listener get updated state
    emitMoveResult(io, room);
  } else {
    emitMoveResult(io, room);
  }

  // Phase-based dispatch
  const state = room.state;

  if (state.phase === 'complete') {
    broadcastGameOver(io, room, state.winner ?? null, state.gameOverReason ?? 'checkmate');
    return;
  }

  if (state.phase === 'promotion') {
    room.moveTimer = clearTimer(room.moveTimer);
    const pending = state.promotionPending;
    if (!pending) return;
    const ownerSocket = getPlayerSocket(room, pending.pieceId ? state.pieces[pending.pieceId]?.color ?? 'white' : 'white');
    // If AI is promoting, ai-runner handles it; otherwise emit to human
    const pieceColor = state.pieces[pending.pieceId]?.color;
    if (!room.hasAI || room.aiColor !== pieceColor) {
      if (ownerSocket) {
        io.to(ownerSocket).emit('promotion_required', {
          pieceId: pending.pieceId,
          upgradeOptions: pending.upgradeOptions,
        } satisfies PromotionRequiredPayload);
      }
      startPromotionTimer(io, ctx, room, pieceColor ?? 'white');
    }
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  if (state.phase === 'ability_pending') {
    room.moveTimer = clearTimer(room.moveTimer);
    const pending = state.abilityPending;
    if (!pending) return;
    const isAIPending = room.hasAI && room.aiColor === pending.pieceColor;
    if (!isAIPending) startAbilityPendingTimer(io, ctx, room, pending.pieceColor);
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  if (state.phase === 'mutation') {
    room.moveTimer = clearTimer(room.moveTimer);
    processMutationQueue(io, ctx, room);
    return;
  }

  // Active — start timer and schedule AI if needed
  startMoveTimer(io, ctx, room);
  scheduleAITurnIfNeeded(io, ctx, room);
}

// ---- Game start ----

export function startGame(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  const handSize = GAME_CONFIG.abilityHandSize;
  room.state = withDerivedPhase({
    ...room.state,
    currentTurn: 'white',
    playerAbilities: {
      white: { hand: drawAbilityHand(handSize) },
      black: { hand: drawAbilityHand(handSize) },
    },
  });

  for (const player of room.players) {
    const socket = getPlayerSocket(room, player.color);
    if (!socket) continue;
    const payload: GameStartPayload = {
      gameState: sanitizeStateForPlayer(room.state, player.color),
      yourColor: player.color,
      vsAI: room.hasAI,
      reconnectToken: player.reconnectToken,
    };
    io.to(socket).emit('game_start', payload);
  }

  // Broadcast active state to any extra connected sockets (reconnect tab scenario)
  const fallback = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
  io.to(room.id).emit('move_result', {
    gameState: room.state, move: fallback, atomic: false, stateVersion: room.stateVersion,
  });

  incrementVersion(room);
  ctx.store.save(toGameRoom(room));
  startMoveTimer(io, ctx, room);
  scheduleAITurnIfNeeded(io, ctx, room);
}

// ---- Action handlers ----
// Each validates, applies, then calls processOutcome.

export function applyMoveAction(
  io: Server, ctx: EngineContext, room: RoomRuntime, pieceId: string, to: Position, color: Color
): void {
  const outcome = handleMove(room.state, pieceId, to, color);
  if (!outcome) { emitError(io, room, color, 'Illegal move'); return; }

  room.state = outcome.newState;
  room.moveTimer = clearTimer(room.moveTimer);

  processOutcome(io, ctx, room, { event: 'move_result', move: outcome.move, atomic: outcome.atomic });
}

export function applyAbilityAction(
  io: Server, ctx: EngineContext, room: RoomRuntime,
  abilityId: AbilityId, pieceId: string | undefined, targetPos: Position | undefined, color: Color
): void {
  const outcome = handleUseAbility(room.state, abilityId, pieceId, targetPos, color);
  if (!outcome) { emitError(io, room, color, 'Ability not available or invalid target'); return; }

  room.state = outcome.newState;
  room.moveTimer = clearTimer(room.moveTimer);

  processOutcome(io, ctx, room, { event: 'ability_result', abilityId, ownerColor: color });
}

export function applyPromotionAction(
  io: Server, ctx: EngineContext, room: RoomRuntime,
  pieceId: string, pieceType: PieceType, upgradeId: string | null, color: Color
): void {
  room.promotionTimer = clearTimer(room.promotionTimer);
  const outcome = handlePromotion(room.state, pieceId, pieceType, upgradeId, color);
  if (!outcome) return;

  room.state = outcome.newState;
  processOutcome(io, ctx, room, { event: 'state_update' });
}

export function applyMutationResponse(
  io: Server, ctx: EngineContext, room: RoomRuntime,
  accepted: boolean, pieceId: string, mutationId: string | undefined, color: Color
): void {
  room.mutationTimer = clearTimer(room.mutationTimer);

  const current = room.state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId) return;

  const outcome = accepted
    ? handleMutationAccept(room.state, pieceId, mutationId ?? '', color)
    : handleMutationDecline(room.state, pieceId, color);
  if (!outcome) return;

  room.state = outcome.newState;

  io.to(room.id).emit('mutation_outcome', {
    pieceId, pieceType: current.pieceType,
    accepted, mutationId, mutationName: accepted ? current.mutations.find(m => m.id === mutationId)?.name : undefined,
    ownerColor: color,
  } satisfies MutationOutcomePayload);

  processOutcome(io, ctx, room, { event: 'state_update' });
}

export function applyDeclineAbilityPending(
  io: Server, ctx: EngineContext, room: RoomRuntime, color: Color
): void {
  if (room.state.phase !== 'ability_pending') return;
  if (room.state.abilityPending?.pieceColor !== color) return;

  room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
  const nextTurn: Color = color === 'white' ? 'black' : 'white';
  room.state = withDerivedPhase({ ...room.state, abilityPending: undefined, currentTurn: nextTurn });

  processOutcome(io, ctx, room, { event: 'state_update' });
}

// ---- Mutation queue processing ----

export function processMutationQueue(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  const current = room.state.mutationQueue[0];
  if (!current) {
    startMoveTimer(io, ctx, room);
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  // AI auto-accepts its own mutations immediately
  if (room.hasAI && room.aiColor === current.ownerColor) {
    applyMutationResponse(io, ctx, room, true, current.pieceId, current.mutations[0]?.id, current.ownerColor);
    return;
  }

  const ownerSocket = getPlayerSocket(room, current.ownerColor);
  if (ownerSocket) {
    io.to(ownerSocket).emit('mutation_available', {
      pieceId: current.pieceId,
      pieceType: current.pieceType,
      triggerType: current.triggerType,
      mutations: current.mutations,
    } satisfies MutationAvailablePayload);
  }
  startMutationTimer(io, ctx, room, current);
}

// ---- Disconnection handling ----

export function handleDisconnect(io: Server, ctx: EngineContext, socketId: string): void {
  const room = getRuntimeBySocketId(ctx, socketId);
  if (!room) return;

  const color = getPlayerColor(room, socketId);
  if (!color) return;

  const player = room.players.find(p => p.color === color);
  if (!player) return;

  if (room.state.phase === 'complete') {
    maybeCleanup(ctx, room);
    return;
  }

  player.connected = false;
  const oppSocket = getPlayerSocket(room, getOpponentColor(color));
  if (oppSocket) io.to(oppSocket).emit('opponent_disconnected');

  room.reconnectTimers.set(color, setTimeout(() => {
    if (room.state.phase !== 'complete') {
      room.moveTimer = clearTimer(room.moveTimer);
      room.promotionTimer = clearTimer(room.promotionTimer);
      room.mutationTimer = clearTimer(room.mutationTimer);
      room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
      room.state = applyDisconnectWin(room.state, color);
      incrementVersion(room);
      ctx.store.save(toGameRoom(room));
      broadcastGameOver(io, room, room.state.winner ?? null, 'disconnect');
    }
    player.connected = false;
    maybeCleanup(ctx, room);
  }, GAME_CONFIG.reconnectionWindowMs));
}

export function handleReconnect(
  io: Server, ctx: EngineContext, room: RoomRuntime, socketId: string, token: string
): Color | null {
  const color = reconnectPlayer(room, socketId, token);
  if (!color) return null;

  io.in(socketId).socketsJoin(room.id);

  if (room.state.phase !== 'waiting') {
    const payload: GameStartPayload = {
      gameState: sanitizeStateForPlayer(room.state, color),
      yourColor: color,
      vsAI: room.hasAI,
      reconnectToken: room.players.find(p => p.color === color)?.reconnectToken ?? '',
    };
    io.to(socketId).emit('game_start', { ...payload, stateVersion: room.stateVersion });

    const oppSocket = getPlayerSocket(room, getOpponentColor(color));
    if (oppSocket) io.to(oppSocket).emit('opponent_reconnected');
  }

  return color;
}

// ---- Room creation ----

export function openRoom(
  io: Server, ctx: EngineContext, socketId: string, vsAI: boolean
): { room: RoomRuntime; color: Color; token: string } | null {
  const room = createRoom(ctx);
  const color = addPlayer(room, socketId);
  if (!color) return null;

  io.in(socketId).socketsJoin(room.id);
  const token = room.players.find(p => p.color === color)!.reconnectToken;

  if (vsAI) {
    room.hasAI = true;
    room.aiColor = color === 'white' ? 'black' : 'white';
    startGame(io, ctx, room);
  }

  return { room, color, token };
}

export function joinRoom(
  io: Server, ctx: EngineContext, socketId: string, roomId: string, token?: string
): { color: Color; isReconnect: boolean } | string {
  const room = getRuntime(ctx, roomId);
  if (!room) return 'Room not found';

  // Token-based reconnect (page refresh scenario)
  if (token) {
    const color = handleReconnect(io, ctx, room, socketId, token);
    if (color) return { color, isReconnect: true };
  }

  // Same-socket reconnect
  const existingColor = getPlayerColor(room, socketId);
  if (existingColor) {
    io.in(socketId).socketsJoin(room.id);
    return { color: existingColor, isReconnect: true };
  }

  if (isFull(room)) return 'Room is full';

  const color = addPlayer(room, socketId);
  if (!color) return 'Room is full';

  io.in(socketId).socketsJoin(room.id);

  if (isFull(room)) startGame(io, ctx, room);

  return { color, isReconnect: false };
}

// ---- Full state resync (anti-entropy) ----

export function handleResync(io: Server, room: RoomRuntime, socketId: string, color: Color): void {
  io.to(socketId).emit('state_full', {
    gameState: sanitizeStateForPlayer(room.state, color),
    stateVersion: room.stateVersion,
  });
}

// ---- Timers ----

function startMoveTimer(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  room.moveTimer = clearTimer(room.moveTimer);
  if (room.state.phase !== 'active') return;

  const seconds = room.state.timerConfig.moveTimerSeconds;
  room.secondsRemaining = seconds;
  room.moveTimerStartedAt = Date.now();

  const tick = (): void => {
    const elapsed = Math.floor((Date.now() - (room.moveTimerStartedAt ?? Date.now())) / 1000);
    room.secondsRemaining = Math.max(0, seconds - elapsed);

    io.to(room.id).emit('timer_update', {
      secondsRemaining: room.secondsRemaining,
      color: room.state.currentTurn,
    } satisfies TimerUpdatePayload);

    if (room.secondsRemaining <= 0) {
      room.moveTimer = null;
      const timedOutColor = room.state.currentTurn;
      if (room.hasAI && timedOutColor === room.aiColor) { room.moveTimer = setTimeout(tick, 1000); return; }
      room.state = applyTimeout(room.state, timedOutColor);
      incrementVersion(room);
      ctx.store.save(toGameRoom(room));
      broadcastGameOver(io, room, room.state.winner ?? null, 'timeout');
      return;
    }
    room.moveTimer = setTimeout(tick, 1000);
  };
  room.moveTimer = setTimeout(tick, 1000);
}

function startPromotionTimer(
  io: Server, ctx: EngineContext, room: RoomRuntime, promotingColor: Color
): void {
  room.promotionTimer = clearTimer(room.promotionTimer);
  room.promotionTimer = setTimeout(() => {
    if (room.state.phase !== 'promotion') return;
    const outcome = handlePromotionTimeout(room.state, promotingColor);
    if (!outcome) return;
    room.state = outcome.newState;
    processOutcome(io, ctx, room, { event: 'state_update' });
  }, 30_000);
}

function startMutationTimer(
  io: Server, ctx: EngineContext, room: RoomRuntime, mutation: MutationPending
): void {
  room.mutationTimer = clearTimer(room.mutationTimer);
  room.mutationTimer = setTimeout(() => {
    if (room.state.phase !== 'mutation') return;
    const outcome = handleMutationTimeout(room.state);
    if (!outcome) return;
    room.state = outcome.newState;
    io.to(room.id).emit('mutation_outcome', {
      pieceId: mutation.pieceId, pieceType: mutation.pieceType,
      accepted: false, ownerColor: mutation.ownerColor,
    } satisfies MutationOutcomePayload);
    processOutcome(io, ctx, room, { event: 'state_update' });
  }, GAME_CONFIG.mutationTimerSeconds * 1000);
}

export function startAbilityPendingTimer(
  io: Server, ctx: EngineContext, room: RoomRuntime, pendingColor: Color
): void {
  room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
  room.abilityPendingTimer = setTimeout(() => {
    if (room.state.phase !== 'ability_pending') return;
    applyDeclineAbilityPending(io, ctx, room, pendingColor);
  }, GAME_CONFIG.abilityPendingTimerSeconds * 1000);
}

// ---- AI scheduling (called from processOutcome) ----
// Actual AI execution lives in ai-runner.ts to keep that dependency one-directional.
// We expose a setter so ai-runner can register its executor.

let _scheduleAITurn: ((io: Server, ctx: EngineContext, room: RoomRuntime) => void) | null = null;

export function registerAIRunner(fn: (io: Server, ctx: EngineContext, room: RoomRuntime) => void): void {
  _scheduleAITurn = fn;
}

function scheduleAITurnIfNeeded(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  if (!room.hasAI || !room.aiColor || !_scheduleAITurn) return;
  _scheduleAITurn(io, ctx, room);
}

// ---- Utilities ----

function emitError(io: Server, room: RoomRuntime, color: Color, message: string): void {
  const socket = getPlayerSocket(room, color);
  if (socket) io.to(socket).emit('error_msg', { message });
}

function maybeCleanup(ctx: EngineContext, room: RoomRuntime): void {
  const allGone = room.players.every(p => !p.connected);
  if (room.hasAI || allGone) {
    ctx.store.delete(room.id);
    ctx.runtimes.delete(room.id);
  }
}

// Re-export for convenience
export { createRoom, addPlayer, getRuntime, getRuntimeBySocketId };
export type { RoomRuntime, PlayerRecord };
