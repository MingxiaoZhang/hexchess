import { io, Socket } from 'socket.io-client';
import {
  GameOverPayload,
  GameStartPayload,
  JoinRoomPayload,
  MakeMovePayload,
  MoveResultPayload,
  Position,
  PromotionRequiredPayload,
  RoomCreatedPayload,
  TimerUpdatePayload,
  PieceType,
  ChoosePromotionPayload,
} from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';

let socket: Socket | null = null;
let onGameOverCallback: ((payload: GameOverPayload) => void) | null = null;
let onMoveResultCallback: ((payload: MoveResultPayload) => void) | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io({ path: '/socket.io', transports: ['websocket'] });
    attachListeners(socket);
  }
  return socket;
}

function attachListeners(sock: Socket): void {
  const store = useGameStore.getState();

  sock.on('connect', () => {
    store.setConnected(true);
    store.setOpponentDisconnected(false);
  });

  sock.on('disconnect', () => {
    store.setConnected(false);
  });

  sock.on('game_start', (payload: GameStartPayload) => {
    store.setGameState(payload.gameState);
    store.setMyColor(payload.yourColor);
    store.setOpponentConnected(true);
  });

  sock.on('move_result', (payload: MoveResultPayload) => {
    store.setGameState(payload.gameState);
    store.selectPiece(null, []);
    if (onMoveResultCallback) onMoveResultCallback(payload);
  });

  sock.on('promotion_required', (payload: PromotionRequiredPayload) => {
    store.setPromotionRequired(payload.pieceId, payload.upgradeOptions);
  });

  sock.on('timer_update', (payload: TimerUpdatePayload) => {
    store.setTimerUpdate(payload.secondsRemaining, payload.color);
  });

  sock.on('game_over', (payload: GameOverPayload) => {
    store.setGameState({ ...useGameStore.getState().gameState!, phase: 'complete' });
    if (onGameOverCallback) onGameOverCallback(payload);
  });

  sock.on('opponent_disconnected', () => {
    store.setOpponentDisconnected(true);
  });

  sock.on('error_msg', (payload: { message: string }) => {
    console.warn('[socket] error:', payload.message);
  });
}

// ---- Actions called by the UI ----

export function createRoom(): Promise<RoomCreatedPayload> {
  return new Promise((resolve) => {
    getSocket().emit('create_room', (payload: RoomCreatedPayload) => {
      const store = useGameStore.getState();
      store.setRoomId(payload.roomId);
      store.setShareUrl(payload.shareUrl);
      resolve(payload);
    });
  });
}

export function joinRoom(roomId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload: JoinRoomPayload = { roomId };
    getSocket().emit('join_room', payload, (err?: string) => {
      if (err) { reject(new Error(err)); return; }
      useGameStore.getState().setRoomId(roomId);
      resolve();
    });
  });
}

export function makeMove(roomId: string, pieceId: string, from: Position, to: Position): void {
  const payload: MakeMovePayload = { roomId, pieceId, from, to };
  getSocket().emit('make_move', payload);
}

export function choosePromotion(roomId: string, pieceType: PieceType, upgradeId: string): void {
  const payload: ChoosePromotionPayload = { roomId, pieceType, upgradeId };
  getSocket().emit('choose_promotion', payload);
  useGameStore.getState().clearPromotion();
}

export function onGameOver(cb: (payload: GameOverPayload) => void): void {
  onGameOverCallback = cb;
}

export function onMoveResult(cb: (payload: MoveResultPayload) => void): void {
  onMoveResultCallback = cb;
}
