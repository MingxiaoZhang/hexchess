import { io, Socket } from 'socket.io-client';
import {
  AcceptMutationPayload,
  ChoosePromotionPayload,
  Color,
  DeclineMutationPayload,
  GameOverPayload,
  GameStartPayload,
  JoinRoomPayload,
  MakeMovePayload,
  MoveResultPayload,
  MutationAvailablePayload,
  MutationOutcomePayload,
  Position,
  PieceType,
  RoomCreatedPayload,
  TimerUpdatePayload,
} from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';

// ---- Session persistence (survives page refresh) ----

const SESSION_KEY = 'hexchess_session';

interface StoredSession {
  roomId: string;
  myColor: Color;
  reconnectToken: string;
}

export function saveSession(s: StoredSession): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(s));
}

export function loadSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch {
    return null;
  }
}

export function clearSession(): void {
  localStorage.removeItem(SESSION_KEY);
}

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
  sock.on('connect', () => {
    useGameStore.getState().setConnected(true);
    useGameStore.getState().setOpponentDisconnected(false);
  });

  sock.on('disconnect', () => {
    useGameStore.getState().setConnected(false);
  });

  sock.on('game_start', (payload: GameStartPayload) => {
    const store = useGameStore.getState();
    store.setGameState(payload.gameState);
    store.setMyColor(payload.yourColor);
    store.setVsAI(payload.vsAI);
    store.setOpponentConnected(true);
    store.setOpponentDisconnected(false);
    store.setReconnecting(false);
    // Persist session so the player can reconnect after a page refresh
    const roomId = store.roomId;
    if (roomId) {
      saveSession({ roomId, myColor: payload.yourColor, reconnectToken: payload.reconnectToken });
    }
  });

  sock.on('move_result', (payload: MoveResultPayload) => {
    useGameStore.getState().setGameState(payload.gameState);
    useGameStore.getState().selectPiece(null, []);
    if (onMoveResultCallback) onMoveResultCallback(payload);
  });

  sock.on('promotion_required', (payload: { pieceId: string; upgradeOptions: import('@hexchess/shared').UpgradeConfig[] }) => {
    useGameStore.getState().setPromotionRequired(payload.pieceId, payload.upgradeOptions);
  });

  sock.on('mutation_available', (payload: MutationAvailablePayload) => {
    useGameStore.getState().setMutationRequired(payload.pieceId, payload.mutations);
  });

  sock.on('mutation_outcome', (payload: MutationOutcomePayload) => {
    // Clear local mutation modal (whether we were the owner or not)
    useGameStore.getState().clearMutation();
    // Show toast to both players
    useGameStore.getState().setMutationToast({
      pieceType: payload.pieceType,
      accepted: payload.accepted,
      mutationName: payload.mutationName,
      ownerColor: payload.ownerColor,
    });
    // Auto-clear toast after 3 seconds
    setTimeout(() => useGameStore.getState().setMutationToast(null), 3000);
  });

  sock.on('timer_update', (payload: TimerUpdatePayload) => {
    useGameStore.getState().setTimerUpdate(payload.secondsRemaining, payload.color);
  });

  sock.on('game_over', (payload: GameOverPayload) => {
    const gs = useGameStore.getState().gameState;
    if (gs) useGameStore.getState().setGameState({ ...gs, phase: 'complete' });
    clearSession(); // game is over — no point keeping the reconnect token
    if (onGameOverCallback) onGameOverCallback(payload);
  });

  sock.on('opponent_disconnected', () => {
    useGameStore.getState().setOpponentDisconnected(true);
  });

  sock.on('opponent_reconnected', () => {
    useGameStore.getState().setOpponentDisconnected(false);
  });

  sock.on('error_msg', (payload: { message: string }) => {
    console.warn('[socket] error:', payload.message);
  });
}

// ---- Actions ----

export function createRoom(vsAI = false): Promise<RoomCreatedPayload> {
  return new Promise((resolve) => {
    getSocket().emit('create_room', { vsAI }, (payload: RoomCreatedPayload) => {
      const store = useGameStore.getState();
      store.setRoomId(payload.roomId);
      store.setShareUrl(payload.shareUrl);
      store.setVsAI(payload.vsAI);
      // Store token now so creator can reconnect even before the opponent joins
      // (myColor isn't known until game_start, so we'll update the full session then)
      localStorage.setItem('hexchess_pending_token', JSON.stringify({
        roomId: payload.roomId,
        reconnectToken: payload.reconnectToken,
      }));
      resolve(payload);
    });
  });
}

export function joinRoom(roomId: string, reconnectToken?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload: JoinRoomPayload = { roomId, reconnectToken };
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

export function acceptMutation(roomId: string, pieceId: string, mutationId: string): void {
  const payload: AcceptMutationPayload = { roomId, pieceId, mutationId };
  getSocket().emit('accept_mutation', payload);
  useGameStore.getState().clearMutation();
}

export function declineMutation(roomId: string, pieceId: string): void {
  const payload: DeclineMutationPayload = { roomId, pieceId };
  getSocket().emit('decline_mutation', payload);
  useGameStore.getState().clearMutation();
}

export function onGameOver(cb: (payload: GameOverPayload) => void): void {
  onGameOverCallback = cb;
}

export function onMoveResult(cb: (payload: MoveResultPayload) => void): void {
  onMoveResultCallback = cb;
}

// Suppress unused type
void ((_: Color) => _);
