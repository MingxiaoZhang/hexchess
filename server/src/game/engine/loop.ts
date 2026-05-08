// processOutcome + timers — kept together because timer callbacks call processOutcome.
// AI runner registration lives here to avoid circular imports with actions.ts.

import { Server } from 'socket.io';
import {
  AbilityId, Color,
  MutationAvailablePayload, MutationOutcomePayload,
  PromotionRequiredPayload, TimerUpdatePayload,
} from '@hexchess/shared';
import { GAME_CONFIG } from '../../config';
import { EngineContext } from '../../store/RoomStore';
import { RoomRuntime, clearTimer, toGameRoom } from '../../store/types';
import {
  handleMutationTimeout, handlePromotionTimeout, applyTimeout,
  sanitizeStateForPlayer, withDerivedPhase,
} from '../state/index';
import { emitMoveResult, broadcastGameOver, incrementVersion } from './broadcast';

// ---- AI runner registration (avoids engine → ai-runner circular import) ----

type AiTurnFn = (io: Server, ctx: EngineContext, room: RoomRuntime) => void;
let _scheduleAITurn: AiTurnFn | null = null;

export function registerAIRunner(fn: AiTurnFn): void {
  _scheduleAITurn = fn;
}

export function scheduleAITurnIfNeeded(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  if (!room.hasAI || !room.aiColor || !_scheduleAITurn) return;
  _scheduleAITurn(io, ctx, room);
}

// ---- processOutcome — single post-action dispatch ----

export type BroadcastPayload =
  | { event: 'move_result'; move: MoveResultPayload['move']; atomic: boolean }
  | { event: 'ability_result'; abilityId: AbilityId; ownerColor: Color }
  | { event: 'state_update' };

// Inline to avoid circular import (broadcast.ts doesn't know about MoveResultPayload details)
type MoveResultPayload = import('@hexchess/shared').MoveResultPayload;

export function processOutcome(
  io: Server, ctx: EngineContext, room: RoomRuntime, payload: BroadcastPayload
): void {
  incrementVersion(room);
  ctx.store.save(toGameRoom(room));

  // Broadcast current state
  if (payload.event === 'move_result') {
    io.to(room.id).emit('move_result', {
      gameState: room.state,
      move: payload.move,
      atomic: payload.atomic,
      stateVersion: room.stateVersion,
    });
  } else if (payload.event === 'ability_result') {
    io.to(room.id).emit('ability_result', {
      gameState: room.state,
      abilityId: payload.abilityId,
      ownerColor: payload.ownerColor,
      stateVersion: room.stateVersion,
    });
    emitMoveResult(io, room); // ensure clients with only move_result listener get updated
  } else {
    emitMoveResult(io, room);
  }

  const state = room.state;

  if (state.phase === 'complete') {
    broadcastGameOver(io, room, state.winner ?? null, state.gameOverReason ?? 'checkmate');
    return;
  }

  if (state.phase === 'promotion') {
    room.moveTimer = clearTimer(room.moveTimer);
    const pending = state.promotionPending;
    if (!pending) return;
    const pieceColor = state.pieces[pending.pieceId]?.color;
    if (!room.hasAI || room.aiColor !== pieceColor) {
      const ownerSocket = room.colorToSocket.get(pieceColor ?? 'white');
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
    if (!room.hasAI || room.aiColor !== pending.pieceColor) {
      startAbilityPendingTimer(io, ctx, room, pending.pieceColor);
    }
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  if (state.phase === 'mutation') {
    room.moveTimer = clearTimer(room.moveTimer);
    processMutationQueue(io, ctx, room);
    return;
  }

  startMoveTimer(io, ctx, room);
  scheduleAITurnIfNeeded(io, ctx, room);
}

// ---- Mutation queue processing ----

export function processMutationQueue(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  const current = room.state.mutationQueue[0];
  if (!current) {
    startMoveTimer(io, ctx, room);
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  // AI auto-accepts its own mutations
  if (room.hasAI && room.aiColor === current.ownerColor) {
    // Defer to ai-runner via scheduleAITurnIfNeeded — it will call accept_mutation
    scheduleAITurnIfNeeded(io, ctx, room);
    return;
  }

  const ownerSocket = room.colorToSocket.get(current.ownerColor);
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

// ---- Timers ----

export function startMoveTimer(io: Server, ctx: EngineContext, room: RoomRuntime): void {
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

function startPromotionTimer(io: Server, ctx: EngineContext, room: RoomRuntime, promotingColor: Color): void {
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
  io: Server, ctx: EngineContext, room: RoomRuntime,
  mutation: import('@hexchess/shared').MutationPending
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

// applyDeclineAbilityPending lives here (not in actions.ts) to avoid a circular import:
// actions.ts → loop.ts/processOutcome → actions.ts would be circular.
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

export function startAbilityPendingTimer(
  io: Server, ctx: EngineContext, room: RoomRuntime, pendingColor: Color
): void {
  room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
  room.abilityPendingTimer = setTimeout(() => {
    if (room.state.phase !== 'ability_pending') return;
    applyDeclineAbilityPending(io, ctx, room, pendingColor);
  }, GAME_CONFIG.abilityPendingTimerSeconds * 1000);
}

// Suppress unused import
void sanitizeStateForPlayer;
