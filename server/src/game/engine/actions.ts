// Action handlers — one per player action type. Each validates → applies → calls processOutcome.

import { Server } from 'socket.io';
import { AbilityId, Color, MutationOutcomePayload, PieceType, Position } from '@hexchess/shared';
import { EngineContext } from '../../store/RoomStore';
import { RoomRuntime, clearTimer } from '../../store/types';
import {
  handleMove, handleUseAbility, handlePromotion, handleMutationAccept, handleMutationDecline,
} from '../state/index';
import { emitError } from './broadcast';
import { processOutcome, BroadcastPayload } from './loop';

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
  processOutcome(io, ctx, room, { event: 'ability_result', abilityId, ownerColor: color } satisfies BroadcastPayload);
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
    pieceId, pieceType: current.pieceType, accepted,
    mutationId, mutationName: accepted ? current.mutations.find(m => m.id === mutationId)?.name : undefined,
    ownerColor: color,
  } satisfies MutationOutcomePayload);

  processOutcome(io, ctx, room, { event: 'state_update' });
}
