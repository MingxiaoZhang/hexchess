// Store types: separates what can be persisted (GameRoom) from what can't (RoomRuntime).
// Engine functions always work with RoomRuntime in memory.
// Persistence implementations serialize/deserialize GameRoom only.

import { Color, GameState } from '@hexchess/shared';

// ---- Serializable ----

export interface PlayerRecord {
  color: Color;
  reconnectToken: string;
  connected: boolean;
}

export interface GameRoom {
  id: string;
  stateVersion: number; // monotonic counter for anti-entropy gap detection
  state: GameState;
  players: PlayerRecord[];
  hasAI: boolean;
  aiColor: Color | null;
  secondsRemaining: number;
}

// ---- Runtime (in-memory only) ----

export interface RoomRuntime extends GameRoom {
  // Socket ↔ color mappings (rebuilt from PlayerRecord on reconnect)
  socketToColor: Map<string, Color>;
  colorToSocket: Map<Color, string>;

  // Per-player reconnect timers
  reconnectTimers: Map<Color, ReturnType<typeof setTimeout>>;

  // Game timers
  moveTimer: ReturnType<typeof setTimeout> | null;
  moveTimerStartedAt: number | null;
  promotionTimer: ReturnType<typeof setTimeout> | null;
  mutationTimer: ReturnType<typeof setTimeout> | null;
  abilityPendingTimer: ReturnType<typeof setTimeout> | null;
  aiTimer: ReturnType<typeof setTimeout> | null;
}

// ---- Conversion utilities ----

export function toGameRoom(rt: RoomRuntime): GameRoom {
  return {
    id: rt.id,
    stateVersion: rt.stateVersion,
    state: rt.state,
    players: rt.players,
    hasAI: rt.hasAI,
    aiColor: rt.aiColor,
    secondsRemaining: rt.secondsRemaining,
  };
}

export function fromGameRoom(room: GameRoom): RoomRuntime {
  return {
    ...room,
    socketToColor: new Map(),
    colorToSocket: new Map(),
    reconnectTimers: new Map(),
    moveTimer: null,
    moveTimerStartedAt: null,
    promotionTimer: null,
    mutationTimer: null,
    abilityPendingTimer: null,
    aiTimer: null,
  };
}

// ---- Player helpers ----

export function getPlayerColor(rt: RoomRuntime, socketId: string): Color | null {
  return rt.socketToColor.get(socketId) ?? null;
}

export function getPlayerSocket(rt: RoomRuntime, color: Color): string | null {
  return rt.colorToSocket.get(color) ?? null;
}

export function getPlayerRecord(rt: RoomRuntime, color: Color): PlayerRecord | undefined {
  return rt.players.find(p => p.color === color);
}

export function getOpponentColor(color: Color): Color {
  return color === 'white' ? 'black' : 'white';
}

export function isFull(rt: RoomRuntime): boolean {
  return rt.hasAI ? rt.players.length >= 1 : rt.players.length >= 2;
}

export function clearTimer(timer: ReturnType<typeof setTimeout> | null): null {
  if (timer !== null) clearTimeout(timer);
  return null;
}
