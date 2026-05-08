// Pure emit helpers — no game logic, no timers. Just fire-and-forget socket calls.

import { Server } from 'socket.io';
import { Color, GameOverPayload, MoveResultPayload } from '@hexchess/shared';
import { RoomRuntime, clearTimer } from '../../store/types';

export function emitMoveResult(io: Server, room: RoomRuntime): void {
  const fallback = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
  io.to(room.id).emit('move_result', {
    gameState: room.state,
    move: room.state.lastMove ?? fallback,
    atomic: false,
    stateVersion: room.stateVersion,
  } satisfies MoveResultPayload & { stateVersion: number });
}

export function broadcastGameOver(
  io: Server, room: RoomRuntime, winner: Color | null, reason: GameOverPayload['reason']
): void {
  room.moveTimer = clearTimer(room.moveTimer);
  room.promotionTimer = clearTimer(room.promotionTimer);
  room.mutationTimer = clearTimer(room.mutationTimer);
  room.abilityPendingTimer = clearTimer(room.abilityPendingTimer);
  io.to(room.id).emit('game_over', { winner, reason } satisfies GameOverPayload);
}

export function incrementVersion(room: RoomRuntime): void {
  room.stateVersion++;
}

export function emitError(io: Server, room: RoomRuntime, color: Color, message: string): void {
  const socket = room.colorToSocket.get(color);
  if (socket) io.to(socket).emit('error_msg', { message });
}

export function maybeCleanup(
  ctx: { store: { delete: (id: string) => Promise<void> }; runtimes: Map<string, RoomRuntime> },
  room: RoomRuntime
): void {
  const allGone = room.players.every(p => !p.connected);
  if (room.hasAI || allGone) {
    ctx.store.delete(room.id);
    ctx.runtimes.delete(room.id);
  }
}
