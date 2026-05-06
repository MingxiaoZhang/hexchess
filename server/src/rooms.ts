import { Color, GameState } from '@hexchess/shared';
import { v4 as uuid } from 'uuid';
import { GAME_CONFIG } from './config';
import { initGameState } from './game/chess';

export interface PlayerInfo {
  socketId: string;
  color: Color;
  connected: boolean;
  reconnectTimer: ReturnType<typeof setTimeout> | null;
  reconnectToken: string; // secret token the client stores in localStorage
}

export interface Room {
  id: string;
  players: PlayerInfo[];
  state: GameState;
  moveTimer: ReturnType<typeof setTimeout> | null;
  moveTimerStartedAt: number | null;
  secondsRemaining: number;
  promotionTimer: ReturnType<typeof setTimeout> | null;
  mutationTimer: ReturnType<typeof setTimeout> | null;
  abilityPendingTimer: ReturnType<typeof setTimeout> | null; // V3: Berserk/Echo pending
  hasAI: boolean;
  aiColor: Color | null;
}

const rooms = new Map<string, Room>();

export function createRoom(): Room {
  const id = uuid().slice(0, 8).toUpperCase();
  const room: Room = {
    id,
    players: [],
    state: initGameState(GAME_CONFIG),
    moveTimer: null,
    moveTimerStartedAt: null,
    secondsRemaining: GAME_CONFIG.moveTimerSeconds,
    promotionTimer: null,
    mutationTimer: null,
    abilityPendingTimer: null,
    hasAI: false,
    aiColor: null,
  };
  rooms.set(id, room);
  return room;
}

export function getRoom(id: string): Room | undefined {
  return rooms.get(id);
}

export function deleteRoom(id: string): void {
  rooms.delete(id);
}

export function addPlayer(room: Room, socketId: string): Color | null {
  if (room.players.length >= 2) return null;
  const color: Color =
    room.players.length === 0
      ? Math.random() < 0.5 ? 'white' : 'black'
      : room.players[0].color === 'white' ? 'black' : 'white';
  const reconnectToken = uuid();
  room.players.push({ socketId, color, connected: true, reconnectTimer: null, reconnectToken });
  return color;
}

export function findPlayerByToken(room: Room, token: string): PlayerInfo | undefined {
  return room.players.find(p => p.reconnectToken === token);
}

export function findPlayerInRoom(room: Room, socketId: string): PlayerInfo | undefined {
  return room.players.find(p => p.socketId === socketId);
}

export function getOpponent(room: Room, socketId: string): PlayerInfo | undefined {
  return room.players.find(p => p.socketId !== socketId);
}

export function isFull(room: Room): boolean {
  // In an AI game the room is full once the one human player has joined
  return room.hasAI ? room.players.length >= 1 : room.players.length >= 2;
}

export function clearMoveTimer(room: Room): void {
  if (room.moveTimer) { clearTimeout(room.moveTimer); room.moveTimer = null; room.moveTimerStartedAt = null; }
}

export function clearPromotionTimer(room: Room): void {
  if (room.promotionTimer) { clearTimeout(room.promotionTimer); room.promotionTimer = null; }
}

export function clearMutationTimer(room: Room): void {
  if (room.mutationTimer) { clearTimeout(room.mutationTimer); room.mutationTimer = null; }
}

export function clearAbilityPendingTimer(room: Room): void {
  if (room.abilityPendingTimer) { clearTimeout(room.abilityPendingTimer); room.abilityPendingTimer = null; }
}

export function clearReconnectTimer(player: PlayerInfo): void {
  if (player.reconnectTimer) { clearTimeout(player.reconnectTimer); player.reconnectTimer = null; }
}

export function findRoomBySocketId(socketId: string): [string, Room] | null {
  for (const [id, room] of rooms.entries()) {
    if (room.players.some(p => p.socketId === socketId)) return [id, room];
  }
  return null;
}
