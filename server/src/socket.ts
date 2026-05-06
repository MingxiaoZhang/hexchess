import { Server, Socket } from 'socket.io';
import {
  AbilityResultPayload,
  AcceptMutationPayload,
  ChoosePromotionPayload,
  Color,
  CreateRoomPayload,
  DeclineAbilityPendingPayload,
  DeclineMutationPayload,
  GameOverPayload,
  GameStartPayload,
  JoinRoomPayload,
  MakeMovePayload,
  MutationAvailablePayload,
  MutationOutcomePayload,
  MoveResultPayload,
  MutationPending,
  Position,
  PromotionRequiredPayload,
  RoomCreatedPayload,
  TimerUpdatePayload,
  UseAbilityPayload,
} from '@hexchess/shared';
import { GAME_CONFIG } from './config';
import {
  Room,
  addPlayer,
  clearAbilityPendingTimer,
  clearMoveTimer,
  clearMutationTimer,
  clearPromotionTimer,
  clearReconnectTimer,
  createRoom,
  deleteRoom,
  findPlayerByToken,
  findPlayerInRoom,
  findRoomBySocketId,
  getOpponent,
  getRoom,
  isFull,
} from './rooms';
import {
  applyDisconnectWin,
  applyTimeout,
  handleMove,
  handleMutationAccept,
  handleMutationDecline,
  handleMutationTimeout,
  handlePromotion,
  handlePromotionTimeout,
  handleUseAbility,
  sanitizeStateForPlayer,
} from './game/state';
import { chooseAIAction } from './game/ai';
import { triggerDescription } from './game/triggers';
import { drawAbilityHand } from './game/abilities';

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ---- Room lifecycle ----

    socket.on('create_room', ({ vsAI = false }: CreateRoomPayload = {}, callback: (p: RoomCreatedPayload) => void) => {
      const room = createRoom();
      const color = addPlayer(room, socket.id);
      if (!color) return;

      socket.join(room.id);
      const origin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';
      const shareUrl = `${origin}/?room=${room.id}`;
      const player = findPlayerInRoom(room, socket.id)!;
      console.log(`[room] created ${room.id} by ${socket.id} vsAI=${vsAI}`);

      if (vsAI) {
        room.hasAI = true;
        room.aiColor = color === 'white' ? 'black' : 'white';
        startGameInRoom(io, room);
      }

      callback({ roomId: room.id, shareUrl, vsAI, reconnectToken: player.reconnectToken, yourColor: color });
    });

    socket.on('join_room', ({ roomId, reconnectToken }: JoinRoomPayload, callback?: (err?: string) => void) => {
      const room = getRoom(roomId);
      if (!room) {
        if (callback) callback('Room not found');
        socket.emit('error_msg', { message: 'Room not found' });
        return;
      }

      // Token-based reconnection: player refreshed the page and has their stored token
      if (reconnectToken) {
        const returning = findPlayerByToken(room, reconnectToken);
        if (returning) {
          returning.socketId = socket.id;
          returning.connected = true;
          clearReconnectTimer(returning);
          socket.join(room.id);
          console.log(`[room] ${socket.id} reconnected to ${room.id} as ${returning.color}`);
          if (callback) callback();
          // Re-send full game state so the client can resume from where it left off
          // Always send current state — even if waiting for a second player.
          // This gives the creator their waiting screen back when they open a
          // second tab or refresh before the opponent has joined.
          const payload: GameStartPayload = {
            gameState: sanitizeStateForPlayer(room.state, returning.color),
            yourColor: returning.color,
            vsAI: room.hasAI,
            reconnectToken: returning.reconnectToken,
          };
          socket.emit('game_start', payload);
          if (room.state.phase !== 'waiting') {
            const opp = getOpponent(room, socket.id);
            if (opp) io.to(opp.socketId).emit('opponent_reconnected');
          }
          return;
        }
      }

      // Legacy same-socket reconnect (socket.io automatic reconnect without page refresh)
      const existing = findPlayerInRoom(room, socket.id);
      if (existing) {
        existing.connected = true;
        clearReconnectTimer(existing);
        socket.join(room.id);
        if (callback) callback();
        return;
      }

      // New player joining
      if (isFull(room)) {
        if (callback) callback('Room is full');
        socket.emit('error_msg', { message: 'Room is full' });
        return;
      }

      const color = addPlayer(room, socket.id);
      if (!color) return;
      socket.join(room.id);
      console.log(`[room] ${socket.id} joined ${room.id} as ${color}`);
      if (callback) callback();

      if (isFull(room)) startGameInRoom(io, room);
    });

    // ---- Move handling ----

    socket.on('make_move', ({ roomId, pieceId, to }: MakeMovePayload) => {
      const room = getRoom(roomId);
      if (!room) return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      const outcome = handleMove(room.state, pieceId, to as Position, player.color);
      if (!outcome) { socket.emit('error_msg', { message: 'Illegal move' }); return; }

      room.state = outcome.newState;
      clearMoveTimer(room);

      io.to(roomId).emit('move_result', {
        gameState: room.state,
        move: outcome.move,
        atomic: outcome.atomic,
      } satisfies MoveResultPayload);

      if (outcome.gameOver) {
        broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate');
        return;
      }

      if (outcome.promotionRequired) {
        startPromotionTimer(io, room, player.color);
        socket.emit('promotion_required', {
          pieceId,
          upgradeOptions: outcome.upgradeOptions,
        } satisfies PromotionRequiredPayload);
        return;
      }

      if (outcome.berserkPending) {
        // Game is in ability_pending/berserk — wait for second capture (handled in make_move)
        startAbilityPendingTimer(io, room, player.color);
        return;
      }

      if (outcome.newTriggers.length > 0) {
        processMutationQueue(io, room);
        return;
      }

      scheduleAIMoveIfNeeded(io, room);
      startMoveTimer(io, room);
    });

    // ---- Ability use ----

    socket.on('use_ability', ({ roomId, abilityId, pieceId, targetPos }: UseAbilityPayload) => {
      const room = getRoom(roomId);
      if (!room) return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      const outcome = handleUseAbility(room.state, abilityId, pieceId, targetPos as Position | undefined, player.color);
      if (!outcome) { socket.emit('error_msg', { message: 'Ability not available or invalid target' }); return; }

      room.state = outcome.newState;
      clearMoveTimer(room);

      io.to(roomId).emit('ability_result', {
        gameState: room.state,
        abilityId,
        ownerColor: player.color,
        pieceId,
        targetPos,
      } satisfies AbilityResultPayload);

      if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }

      if (outcome.abilityPending) {
        // Echo or Berserk entered pending — wait for follow-up
        startAbilityPendingTimer(io, room, player.color);
        return;
      }

      if (outcome.promotionNeeded) {
        const pending = room.state.promotionPending;
        if (pending) {
          startPromotionTimer(io, room, player.color);
          socket.emit('promotion_required', { pieceId: pending.pieceId, upgradeOptions: pending.upgradeOptions } satisfies PromotionRequiredPayload);
        }
        return;
      }

      scheduleAIMoveIfNeeded(io, room);
      startMoveTimer(io, room);
    });

    socket.on('decline_ability_pending', ({ roomId }: DeclineAbilityPendingPayload) => {
      const room = getRoom(roomId);
      if (!room || room.state.phase !== 'ability_pending') return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;
      if (room.state.abilityPending?.pieceColor !== player.color) return;

      clearAbilityPendingTimer(room);
      room.state = { ...room.state, phase: 'active', abilityPending: undefined,
        currentTurn: room.state.currentTurn === player.color ? (player.color === 'white' ? 'black' : 'white') : room.state.currentTurn };
      emitMoveResult(io, room);
      scheduleAIMoveIfNeeded(io, room);
      startMoveTimer(io, room);
    });

    // ---- Promotion ----

    socket.on('choose_promotion', ({ roomId, pieceType, upgradeId }: ChoosePromotionPayload) => {
      const room = getRoom(roomId);
      if (!room || !room.state.promotionPending) return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      clearPromotionTimer(room);
      const outcome = handlePromotion(
        room.state, room.state.promotionPending.pieceId, pieceType, upgradeId, player.color
      );
      if (!outcome) return;

      room.state = outcome.newState;
      emitMoveResult(io, room);

      if (outcome.gameOver) {
        broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate');
        return;
      }

      if (outcome.newTriggers.length > 0) {
        processMutationQueue(io, room);
        return;
      }

      scheduleAIMoveIfNeeded(io, room);
      startMoveTimer(io, room);
    });

    // ---- Mutation accept / decline ----

    socket.on('accept_mutation', ({ roomId, pieceId, mutationId }: AcceptMutationPayload) => {
      const room = getRoom(roomId);
      if (!room) return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      applyMutationAccept(io, room, pieceId, mutationId, player.color);
    });

    socket.on('decline_mutation', ({ roomId, pieceId }: DeclineMutationPayload) => {
      const room = getRoom(roomId);
      if (!room) return;
      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      applyMutationDecline(io, room, pieceId, player.color);
    });

    // ---- Disconnection ----

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);
      const found = findRoomBySocketId(socket.id);
      if (!found) return;
      const [roomId, room] = found;

      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      if (room.state.phase === 'complete') { maybeCleanupRoom(roomId, room); return; }

      player.connected = false;
      const opp = getOpponent(room, socket.id);
      if (opp) io.to(opp.socketId).emit('opponent_disconnected');

      player.reconnectTimer = setTimeout(() => {
        if (room.state.phase !== 'complete') {
          clearMoveTimer(room);
          clearPromotionTimer(room);
          clearMutationTimer(room);
          room.state = applyDisconnectWin(room.state, player.color);
          broadcastGameOver(io, room, room.state.winner ?? null, 'disconnect');
        }
        player.connected = false;
        maybeCleanupRoom(roomId, room);
      }, GAME_CONFIG.reconnectionWindowMs);
    });
  });
}

// ---- Game start ----

function startGameInRoom(io: Server, room: Room): void {
  // V3: deal ability hands to both players
  const handSize = GAME_CONFIG.abilityHandSize;
  room.state = {
    ...room.state,
    phase: 'active',
    playerAbilities: {
      white: { hand: drawAbilityHand(handSize) },
      black: { hand: drawAbilityHand(handSize) },
    },
  };

  for (const player of room.players) {
    const payload: GameStartPayload = {
      gameState: sanitizeStateForPlayer(room.state, player.color),
      yourColor: player.color,
      vsAI: room.hasAI,
      reconnectToken: player.reconnectToken,
    };
    io.to(player.socketId).emit('game_start', payload);
  }

  const fallbackMove = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
  io.to(room.id).emit('move_result', {
    gameState: room.state,
    move: fallbackMove,
    atomic: false,
  } satisfies MoveResultPayload);

  scheduleAIMoveIfNeeded(io, room);
  startMoveTimer(io, room);
}

// ---- Mutation processing ----

function processMutationQueue(io: Server, room: Room): void {
  const current = room.state.mutationQueue[0];
  if (!current) {
    // Queue drained — resume game
    scheduleAIMoveIfNeeded(io, room);
    startMoveTimer(io, room);
    return;
  }

  // Is this mutation for the AI? Auto-accept immediately.
  if (room.hasAI && room.aiColor === current.ownerColor) {
    applyMutationAccept(io, room, current.pieceId, current.mutations[0]?.id ?? '', current.ownerColor);
    return;
  }

  // Send offer to owning player only
  const ownerSocket = room.players.find(p => p.color === current.ownerColor);
  if (ownerSocket) {
    io.to(ownerSocket.socketId).emit('mutation_available', {
      pieceId: current.pieceId,
      pieceType: current.pieceType,
      triggerType: current.triggerType,
      mutations: current.mutations,
    } satisfies MutationAvailablePayload);
  }

  startMutationTimer(io, room, current);
}

function applyMutationAccept(
  io: Server,
  room: Room,
  pieceId: string,
  mutationId: string,
  ownerColor: Color
): void {
  clearMutationTimer(room);
  const current = room.state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId) return;

  const outcome = handleMutationAccept(room.state, pieceId, mutationId, ownerColor);
  if (!outcome) return;

  room.state = outcome.newState;

  io.to(room.id).emit('mutation_outcome', {
    pieceId,
    pieceType: current.pieceType,
    accepted: true,
    mutationId,
    mutationName: current.mutations.find(m => m.id === mutationId)?.name,
    ownerColor,
  } satisfies MutationOutcomePayload);

  emitMoveResult(io, room);

  if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }
  if (outcome.nextMutation) { processMutationQueue(io, room); return; }

  scheduleAIMoveIfNeeded(io, room);
  startMoveTimer(io, room);
}

function applyMutationDecline(
  io: Server,
  room: Room,
  pieceId: string,
  ownerColor: Color
): void {
  clearMutationTimer(room);
  const current = room.state.mutationQueue[0];
  if (!current || current.pieceId !== pieceId) return;

  const outcome = handleMutationDecline(room.state, pieceId, ownerColor);
  if (!outcome) return;

  room.state = outcome.newState;

  io.to(room.id).emit('mutation_outcome', {
    pieceId,
    pieceType: current.pieceType,
    accepted: false,
    ownerColor,
  } satisfies MutationOutcomePayload);

  emitMoveResult(io, room);

  if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }
  if (outcome.nextMutation) { processMutationQueue(io, room); return; }

  scheduleAIMoveIfNeeded(io, room);
  startMoveTimer(io, room);
}

// ---- AI move scheduling ----

function scheduleAIMoveIfNeeded(io: Server, room: Room): void {
  if (!room.hasAI || room.state.phase !== 'active') return;
  if (room.state.currentTurn !== room.aiColor) return;

  // Small delay so the board update renders before AI moves
  setTimeout(() => {
    if (room.state.phase !== 'active' || room.state.currentTurn !== room.aiColor) return;
    triggerAIMove(io, room);
  }, 600 + Math.random() * 400);
}

function triggerAIMove(io: Server, room: Room): void {
  const aiColor = room.aiColor;
  if (!aiColor) return;

  const aiAction = chooseAIAction(room.state, aiColor);
  if (!aiAction) return;

  // AI uses an ability
  if (aiAction.type === 'ability') {
    const abilityOutcome = handleUseAbility(room.state, aiAction.abilityId, aiAction.pieceId, aiAction.targetPos, aiColor);
    if (abilityOutcome) {
      room.state = abilityOutcome.newState;
      clearMoveTimer(room);
      io.to(room.id).emit('ability_result', {
        gameState: room.state, abilityId: aiAction.abilityId, ownerColor: aiColor,
        pieceId: aiAction.pieceId, targetPos: aiAction.targetPos,
      } satisfies AbilityResultPayload);
      if (abilityOutcome.gameOver) { broadcastGameOver(io, room, abilityOutcome.winner, abilityOutcome.reason ?? 'checkmate'); return; }
      if (!abilityOutcome.abilityPending) { startMoveTimer(io, room); }
    } else {
      // Ability failed — fall back to a normal move
      const fallback = room.state;
      void fallback;
    }
    return;
  }

  // AI makes a regular move
  const outcome = handleMove(room.state, aiAction.pieceId, aiAction.to, aiColor);
  if (!outcome) return;

  room.state = outcome.newState;
  clearMoveTimer(room);

  io.to(room.id).emit('move_result', {
    gameState: room.state,
    move: outcome.move,
    atomic: outcome.atomic,
  } satisfies MoveResultPayload);

  if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }

  if (outcome.promotionRequired) {
    // AI always picks queen + first upgrade
    const promotionState = outcome.newState;
    const pending = promotionState.promotionPending;
    if (pending) {
      const promoOutcome = handlePromotion(
        promotionState, pending.pieceId, 'queen',
        pending.upgradeOptions[0]?.id ?? null, aiColor
      );
      if (promoOutcome) {
        room.state = promoOutcome.newState;
        emitMoveResult(io, room);
        if (promoOutcome.gameOver) { broadcastGameOver(io, room, promoOutcome.winner, promoOutcome.reason ?? 'checkmate'); return; }
        if (promoOutcome.newTriggers.length > 0) { processMutationQueue(io, room); return; }
      }
    }
    scheduleAIMoveIfNeeded(io, room); // shouldn't be AI's turn again after promoting
    return; // human's turn now (or mutation pending)
  }

  if (outcome.newTriggers.length > 0) { processMutationQueue(io, room); return; }

  startMoveTimer(io, room);
  // Note: after AI moves it's now human's turn — no need to schedule AI again yet.
}

// ---- Timer helpers ----

function startMoveTimer(io: Server, room: Room): void {
  clearMoveTimer(room);
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
      clearMoveTimer(room);
      const timedOutColor = room.state.currentTurn;
      // AI gets unlimited time (shouldn't time out but guard anyway)
      if (room.hasAI && timedOutColor === room.aiColor) return;
      room.state = applyTimeout(room.state, timedOutColor);
      broadcastGameOver(io, room, room.state.winner ?? null, 'timeout');
      return;
    }
    room.moveTimer = setTimeout(tick, 1000);
  };
  room.moveTimer = setTimeout(tick, 1000);
}

function startPromotionTimer(io: Server, room: Room, promotingColor: Color): void {
  clearPromotionTimer(room);
  room.promotionTimer = setTimeout(() => {
    if (room.state.phase !== 'promotion') return;
    const outcome = handlePromotionTimeout(room.state, promotingColor);
    if (!outcome) return;
    room.state = outcome.newState;
    emitMoveResult(io, room);
    if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }
    if (outcome.newTriggers.length > 0) { processMutationQueue(io, room); return; }
    scheduleAIMoveIfNeeded(io, room);
    startMoveTimer(io, room);
  }, 30_000);
}

function startMutationTimer(io: Server, room: Room, mutation: MutationPending): void {
  clearMutationTimer(room);
  room.mutationTimer = setTimeout(() => {
    if (room.state.phase !== 'mutation') return;
    console.log(`[mutation] timer expired for ${mutation.pieceId} — auto-decline`);
    const outcome = handleMutationTimeout(room.state);
    if (!outcome) return;
    room.state = outcome.newState;
    io.to(room.id).emit('mutation_outcome', {
      pieceId: mutation.pieceId,
      pieceType: mutation.pieceType,
      accepted: false,
      ownerColor: mutation.ownerColor,
    } satisfies MutationOutcomePayload);
    emitMoveResult(io, room);
    if (outcome.gameOver) { broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate'); return; }
    if (outcome.nextMutation) { processMutationQueue(io, room); return; }
    scheduleAIMoveIfNeeded(io, room);
    startMoveTimer(io, room);
  }, GAME_CONFIG.mutationTimerSeconds * 1000);
}

// ---- Ability pending timer ----

function startAbilityPendingTimer(io: Server, room: Room, pendingColor: Color): void {
  clearAbilityPendingTimer(room);
  room.abilityPendingTimer = setTimeout(() => {
    if (room.state.phase !== 'ability_pending') return;
    console.log(`[ability] pending timer expired for ${pendingColor} — auto-skip`);
    // Auto-skip: advance turn
    const nextTurn: Color = pendingColor === 'white' ? 'black' : 'white';
    room.state = { ...room.state, phase: 'active', abilityPending: undefined, currentTurn: nextTurn };
    emitMoveResult(io, room);
    scheduleAIMoveIfNeeded(io, room);
    startMoveTimer(io, room);
  }, GAME_CONFIG.abilityPendingTimerSeconds * 1000);
}

// ---- Utilities ----

function emitMoveResult(io: Server, room: Room): void {
  const fallbackMove = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
  io.to(room.id).emit('move_result', {
    gameState: room.state,
    move: room.state.lastMove ?? fallbackMove,
    atomic: false,
  } satisfies MoveResultPayload);
}

function broadcastGameOver(
  io: Server,
  room: Room,
  winner: Color | null,
  reason: GameOverPayload['reason']
): void {
  clearMoveTimer(room);
  clearPromotionTimer(room);
  clearMutationTimer(room);
  clearAbilityPendingTimer(room);
  io.to(room.id).emit('game_over', { winner, reason } satisfies GameOverPayload);
  console.log(`[room] game over ${room.id}: winner=${winner ?? 'draw'} reason=${reason}`);
}

function maybeCleanupRoom(roomId: string, room: Room): void {
  if (room.hasAI || room.players.every(p => !p.connected)) {
    deleteRoom(roomId);
    console.log(`[room] cleaned up ${roomId}`);
  }
}

// Suppress unused import
void triggerDescription;
