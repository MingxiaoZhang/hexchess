// Event wiring only — no business logic.
// Each socket event delegates to an engine function.
// Both human players and the AI go through the same engine functions.

import { Server, Socket } from 'socket.io';
import {
  AcceptMutationPayload,
  ChoosePromotionPayload,
  CreateRoomPayload,
  DeclineAbilityPendingPayload,
  DeclineMutationPayload,
  JoinRoomPayload,
  MakeMovePayload,
  Position,
  UseAbilityPayload,
} from '@hexchess/shared';
import { EngineContext } from './store/RoomStore';
import {
  applyMoveAction,
  applyAbilityAction,
  applyPromotionAction,
  applyMutationResponse,
  applyDeclineAbilityPending,
  handleDisconnect,
  handleResync,
  openRoom,
  joinRoom,
  getRuntime,
} from './game/engine';
import { getPlayerColor } from './store/types';

// Side-effect import: registers the AI runner with the engine
import './game/ai-runner';

export function registerSocketHandlers(io: Server, ctx: EngineContext): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    socket.on('create_room', ({ vsAI = false }: CreateRoomPayload = {}, callback: (p: object) => void) => {
      const result = openRoom(io, ctx, socket.id, vsAI);
      if (!result) return;
      const origin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';
      callback({
        roomId: result.room.id,
        shareUrl: `${origin}/?room=${result.room.id}`,
        vsAI,
        reconnectToken: result.token,
        yourColor: result.color,
      });
    });

    socket.on('join_room', ({ roomId, reconnectToken }: JoinRoomPayload, callback?: (err?: string) => void) => {
      const result = joinRoom(io, ctx, socket.id, roomId, reconnectToken);
      if (typeof result === 'string') {
        if (callback) callback(result);
        socket.emit('error_msg', { message: result });
        return;
      }
      if (callback) callback();
    });

    socket.on('make_move', ({ roomId, pieceId, to }: MakeMovePayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyMoveAction(io, ctx, room, pieceId, to as Position, color);
    });

    socket.on('use_ability', ({ roomId, abilityId, pieceId, targetPos }: UseAbilityPayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyAbilityAction(io, ctx, room, abilityId, pieceId, targetPos as Position | undefined, color);
    });

    socket.on('choose_promotion', ({ roomId, pieceType, upgradeId }: ChoosePromotionPayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room || !room.state.promotionPending) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyPromotionAction(io, ctx, room, room.state.promotionPending.pieceId, pieceType, upgradeId, color);
    });

    socket.on('accept_mutation', ({ roomId, pieceId, mutationId }: AcceptMutationPayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyMutationResponse(io, ctx, room, true, pieceId, mutationId, color);
    });

    socket.on('decline_mutation', ({ roomId, pieceId }: DeclineMutationPayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyMutationResponse(io, ctx, room, false, pieceId, undefined, color);
    });

    socket.on('decline_ability_pending', ({ roomId }: DeclineAbilityPendingPayload) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      applyDeclineAbilityPending(io, ctx, room, color);
    });

    socket.on('request_resync', ({ roomId }: { roomId: string }) => {
      const room = getRuntime(ctx, roomId);
      if (!room) return;
      const color = getPlayerColor(room, socket.id);
      if (!color) return;
      handleResync(io, room, socket.id, color);
    });

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      handleDisconnect(io, ctx, socket.id);
    });
  });
}
