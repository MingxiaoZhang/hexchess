import { Server, Socket } from 'socket.io';
import {
  ChoosePromotionPayload,
  Color,
  GameOverPayload,
  GameStartPayload,
  JoinRoomPayload,
  MakeMovePayload,
  MoveResultPayload,
  Position,
  PromotionRequiredPayload,
  RoomCreatedPayload,
  TimerUpdatePayload,
} from '@hexchess/shared';
import { GAME_CONFIG } from './config';
import {
  Room,
  addPlayer,
  clearMoveTimer,
  clearPromotionTimer,
  clearReconnectTimer,
  createRoom,
  deleteRoom,
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
  handlePromotion,
  handlePromotionTimeout,
  sanitizeStateForPlayer,
} from './game/state';

export function registerSocketHandlers(io: Server): void {
  io.on('connection', (socket: Socket) => {
    console.log(`[socket] connected: ${socket.id}`);

    // ---- Room lifecycle ----

    socket.on('create_room', (callback: (payload: RoomCreatedPayload) => void) => {
      const room = createRoom();
      const color = addPlayer(room, socket.id);
      if (!color) return;

      socket.join(room.id);
      const origin = process.env['CLIENT_ORIGIN'] ?? 'http://localhost:5173';
      const shareUrl = `${origin}/?room=${room.id}`;
      console.log(`[room] created ${room.id} by ${socket.id}`);
      callback({ roomId: room.id, shareUrl });
    });

    socket.on('join_room', ({ roomId }: JoinRoomPayload, callback?: (err?: string) => void) => {
      const room = getRoom(roomId);

      if (!room) {
        if (callback) callback('Room not found');
        socket.emit('error_msg', { message: 'Room not found' });
        return;
      }

      // Check if this socket is reconnecting
      const existing = findPlayerInRoom(room, socket.id);
      if (existing) {
        existing.connected = true;
        clearReconnectTimer(existing);
        socket.join(room.id);
        if (callback) callback();
        return;
      }

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

      // Both players now present — start the game
      if (isFull(room)) {
        room.state = { ...room.state, phase: 'active' };

        for (const player of room.players) {
          const payload: GameStartPayload = {
            gameState: sanitizeStateForPlayer(room.state, player.color),
            yourColor: player.color,
          };
          io.to(player.socketId).emit('game_start', payload);
        }

        startMoveTimer(io, room);
      }
    });

    // ---- Move handling ----

    socket.on('make_move', ({ roomId, pieceId, to }: MakeMovePayload) => {
      const room = getRoom(roomId);
      if (!room) return;

      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      const outcome = handleMove(room.state, pieceId, to as Position, player.color);
      if (!outcome) {
        socket.emit('error_msg', { message: 'Illegal move' });
        return;
      }

      room.state = outcome.newState;
      clearMoveTimer(room);

      const payload: MoveResultPayload = {
        gameState: room.state,
        move: outcome.move,
        atomic: outcome.atomic,
      };
      io.to(roomId).emit('move_result', payload);

      if (outcome.gameOver) {
        broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate');
        return;
      }

      if (outcome.promotionRequired) {
        startPromotionTimer(io, room, player.color);
        const promPayload: PromotionRequiredPayload = {
          pieceId,
          upgradeOptions: outcome.upgradeOptions,
        };
        socket.emit('promotion_required', promPayload);
        return;
      }

      startMoveTimer(io, room);
    });

    // ---- Promotion choice ----

    socket.on('choose_promotion', ({ roomId, pieceType, upgradeId }: ChoosePromotionPayload) => {
      const room = getRoom(roomId);
      if (!room || !room.state.promotionPending) return;

      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      clearPromotionTimer(room);

      const outcome = handlePromotion(
        room.state,
        room.state.promotionPending.pieceId,
        pieceType,
        upgradeId,
        player.color
      );
      if (!outcome) return;

      room.state = outcome.newState;

      const fallbackMove = {
        pieceId: room.state.promotionPending?.pieceId ?? '',
        from: { row: 0, col: 0 },
        to: { row: 0, col: 0 },
      };
      io.to(roomId).emit('move_result', {
        gameState: room.state,
        move: room.state.lastMove ?? fallbackMove,
        atomic: false,
      } satisfies MoveResultPayload);

      if (outcome.gameOver) {
        broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate');
        return;
      }

      startMoveTimer(io, room);
    });

    // ---- Disconnection ----

    socket.on('disconnect', () => {
      console.log(`[socket] disconnected: ${socket.id}`);

      const found = findRoomBySocketId(socket.id);
      if (!found) return;
      const [roomId, room] = found;

      const player = findPlayerInRoom(room, socket.id);
      if (!player) return;

      if (room.state.phase === 'complete') {
        maybeCleanupRoom(roomId, room);
        return;
      }

      player.connected = false;
      const opp = getOpponent(room, socket.id);
      if (opp) io.to(opp.socketId).emit('opponent_disconnected');

      player.reconnectTimer = setTimeout(() => {
        if (room.state.phase !== 'complete') {
          clearMoveTimer(room);
          clearPromotionTimer(room);
          room.state = applyDisconnectWin(room.state, player.color);
          broadcastGameOver(io, room, room.state.winner ?? null, 'disconnect');
        }
        player.connected = false;
        maybeCleanupRoom(roomId, room);
      }, GAME_CONFIG.reconnectionWindowMs);
    });
  });
}

// ---- Timer helpers ----

function startMoveTimer(io: Server, room: Room): void {
  clearMoveTimer(room);

  const seconds = room.state.timerConfig.moveTimerSeconds;
  room.secondsRemaining = seconds;
  room.moveTimerStartedAt = Date.now();

  const tick = (): void => {
    const elapsed = Math.floor((Date.now() - (room.moveTimerStartedAt ?? Date.now())) / 1000);
    room.secondsRemaining = Math.max(0, seconds - elapsed);

    const payload: TimerUpdatePayload = {
      secondsRemaining: room.secondsRemaining,
      color: room.state.currentTurn,
    };
    io.to(room.id).emit('timer_update', payload);

    if (room.secondsRemaining <= 0) {
      const timedOutColor = room.state.currentTurn;
      clearMoveTimer(room);
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
    const fallbackMove = { pieceId: '', from: { row: 0, col: 0 }, to: { row: 0, col: 0 } };
    io.to(room.id).emit('move_result', {
      gameState: room.state,
      move: room.state.lastMove ?? fallbackMove,
      atomic: false,
    } satisfies MoveResultPayload);

    if (outcome.gameOver) {
      broadcastGameOver(io, room, outcome.winner, outcome.reason ?? 'checkmate');
      return;
    }

    startMoveTimer(io, room);
  }, 30_000);
}

function broadcastGameOver(
  io: Server,
  room: Room,
  winner: Color | null,
  reason: GameOverPayload['reason']
): void {
  clearMoveTimer(room);
  clearPromotionTimer(room);
  const payload: GameOverPayload = { winner, reason };
  io.to(room.id).emit('game_over', payload);
  console.log(`[room] game over in ${room.id}: winner=${winner ?? 'draw'} reason=${reason}`);
}

function maybeCleanupRoom(roomId: string, room: Room): void {
  const allDisconnected = room.players.every(p => !p.connected);
  if (allDisconnected) {
    deleteRoom(roomId);
    console.log(`[room] cleaned up ${roomId}`);
  }
}
