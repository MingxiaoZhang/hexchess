// AI execution — calls the same engine functions a human player would.

import { Server } from 'socket.io';
import { EngineContext } from '../store/RoomStore';
import { RoomRuntime } from '../store/types';
import { getAIAction } from './ai';
import {
  applyMoveAction, applyAbilityAction, applyPromotionAction, applyMutationResponse,
  registerAIRunner, startAbilityPendingTimer, applyDeclineAbilityPending,
} from './engine/index';

function shouldAIAct(room: RoomRuntime): boolean {
  if (!room.hasAI || !room.aiColor) return false;
  const state = room.state;
  if (state.phase === 'complete' || state.phase === 'waiting') return false;
  if (state.phase === 'ability_pending') return state.abilityPending?.pieceColor === room.aiColor;
  if (state.phase === 'promotion') {
    const pieceColor = state.promotionPending ? state.pieces[state.promotionPending.pieceId]?.color : undefined;
    return pieceColor === room.aiColor;
  }
  if (state.phase === 'mutation') return state.mutationQueue[0]?.ownerColor === room.aiColor;
  return state.currentTurn === room.aiColor;
}

export function scheduleAITurn(io: Server, ctx: EngineContext, room: RoomRuntime, delayMs = 700): void {
  if (!shouldAIAct(room)) return;
  clearTimeout(room.aiTimer ?? undefined);
  room.aiTimer = setTimeout(() => executeAITurn(io, ctx, room), delayMs + Math.random() * 400);
}

function executeAITurn(io: Server, ctx: EngineContext, room: RoomRuntime): void {
  const aiColor = room.aiColor;
  if (!aiColor || !shouldAIAct(room)) return;

  const action = getAIAction(room.state, aiColor);
  if (!action) return;

  switch (action.type) {
    case 'move':
      applyMoveAction(io, ctx, room, action.pieceId, action.to, aiColor);
      break;
    case 'ability':
      applyAbilityAction(io, ctx, room, action.abilityId, action.pieceId, action.targetPos, aiColor);
      break;
    case 'promote':
      applyPromotionAction(io, ctx, room, action.pieceId, action.pieceType, action.upgradeId, aiColor);
      break;
    case 'accept_mutation':
      applyMutationResponse(io, ctx, room, true, action.pieceId, action.mutationId, aiColor);
      break;
  }
}

registerAIRunner(scheduleAITurn);

// Suppress unused
void startAbilityPendingTimer;
void applyDeclineAbilityPending;
