// Room lifecycle — creation, joining, disconnection, reconnection, game start.

import { Server } from 'socket.io';
import { GameStartPayload } from '@hexchess/shared';
import { GAME_CONFIG } from '../../config';
import {
  EngineContext, createRoom, addPlayer, reconnectPlayer, getRuntime, getRuntimeBySocketId,
} from '../../store/RoomStore';
import {
  RoomRuntime, PlayerRecord, clearTimer, getPlayerColor, getOpponentColor, isFull, toGameRoom,
} from '../../store/types';
import { drawAbilityHand } from '../abilities';
import { withDerivedPhase, sanitizeStateForPlayer, applyDisconnectWin } from '../state/index';
import { broadcastGameOver, emitMoveResult, incrementVersion } from './broadcast';
import { startMoveTimer, scheduleAITurnIfNeeded, processOutcome } from './loop';

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
    const socket = room.colorToSocket.get(player.color);
    if (!socket) continue;
    io.to(socket).emit('game_start', {
      gameState: sanitizeStateForPlayer(room.state, player.color),
      yourColor: player.color,
      vsAI: room.hasAI,
      reconnectToken: player.reconnectToken,
    } satisfies GameStartPayload);
  }

  // Broadcast to any extra sockets in the room (reconnect tab scenario)
  emitMoveResult(io, room);
  incrementVersion(room);
  ctx.store.save(toGameRoom(room));
  startMoveTimer(io, ctx, room);
  scheduleAITurnIfNeeded(io, ctx, room);
}

export function openRoom(
  io: Server, ctx: EngineContext, socketId: string, vsAI: boolean
): { room: RoomRuntime; color: import('@hexchess/shared').Color; token: string } | null {
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
): { color: import('@hexchess/shared').Color; isReconnect: boolean } | string {
  const room = getRuntime(ctx, roomId);
  if (!room) return 'Room not found';

  if (token) {
    const color = handleReconnect(io, ctx, room, socketId, token);
    if (color) return { color, isReconnect: true };
  }

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

export function handleReconnect(
  io: Server, ctx: EngineContext, room: RoomRuntime, socketId: string, token: string
): import('@hexchess/shared').Color | null {
  const color = reconnectPlayer(room, socketId, token);
  if (!color) return null;

  io.in(socketId).socketsJoin(room.id);

  if (room.state.phase !== 'waiting') {
    const player = room.players.find(p => p.color === color);
    io.to(socketId).emit('game_start', {
      gameState: sanitizeStateForPlayer(room.state, color),
      yourColor: color,
      vsAI: room.hasAI,
      reconnectToken: player?.reconnectToken ?? '',
      stateVersion: room.stateVersion,
    });
    const oppSocket = room.colorToSocket.get(getOpponentColor(color));
    if (oppSocket) io.to(oppSocket).emit('opponent_reconnected');
  }

  return color;
}

export function handleDisconnect(io: Server, ctx: EngineContext, socketId: string): void {
  const room = getRuntimeBySocketId(ctx, socketId);
  if (!room) return;

  const color = getPlayerColor(room, socketId);
  if (!color) return;
  const player = room.players.find(p => p.color === color);
  if (!player) return;

  if (room.state.phase === 'complete') { maybeCleanup(ctx, room); return; }

  player.connected = false;
  const oppSocket = room.colorToSocket.get(getOpponentColor(color));
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

export function handleResync(
  io: Server, room: RoomRuntime, socketId: string, color: import('@hexchess/shared').Color
): void {
  io.to(socketId).emit('state_full', {
    gameState: sanitizeStateForPlayer(room.state, color),
    stateVersion: room.stateVersion,
  });
}

function maybeCleanup(ctx: EngineContext, room: RoomRuntime): void {
  const allGone = room.players.every(p => !p.connected);
  if (room.hasAI || allGone) {
    ctx.store.delete(room.id);
    ctx.runtimes.delete(room.id);
  }
}

// Suppress unused
void processOutcome;
export type { RoomRuntime, PlayerRecord };
