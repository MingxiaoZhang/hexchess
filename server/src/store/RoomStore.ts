// RoomStore interface + InMemoryRoomStore implementation.
// Future implementations (Redis, Postgres) implement RoomStore without touching anything else.

import { Color } from '@hexchess/shared';
import { v4 as uuid } from 'uuid';
import { GameRoom, PlayerRecord, RoomRuntime, fromGameRoom, toGameRoom } from './types';
import { initGameState } from '../game/chess';
import { GAME_CONFIG } from '../config';

export interface RoomStore {
  get(roomId: string): Promise<GameRoom | null>;
  save(room: GameRoom): Promise<void>;
  delete(roomId: string): Promise<void>;
  findByToken(token: string): Promise<GameRoom | null>;
  all(): Promise<GameRoom[]>;
}

// ---- Engine context ----
// Passed to every engine function. Holds everything the engine needs.

export interface EngineContext {
  store: RoomStore;
  runtimes: Map<string, RoomRuntime>; // hot in-memory working set
}

// ---- InMemoryRoomStore ----
// Uses the same runtimes Map as the EngineContext — no duplication.
// save() is effectively a no-op for the in-memory case (runtime is already updated by the engine).
// swap() this for RedisRoomStore when you need horizontal scaling or persistence.

export class InMemoryRoomStore implements RoomStore {
  constructor(private readonly runtimes: Map<string, RoomRuntime>) {}

  async get(roomId: string): Promise<GameRoom | null> {
    const rt = this.runtimes.get(roomId);
    return rt ? toGameRoom(rt) : null;
  }

  async save(room: GameRoom): Promise<void> {
    const rt = this.runtimes.get(room.id);
    if (rt) {
      // Update the serializable fields in-place on the existing runtime
      rt.stateVersion = room.stateVersion;
      rt.state = room.state;
      rt.players = room.players;
      rt.secondsRemaining = room.secondsRemaining;
    }
    // If runtime doesn't exist, this is a no-op (must use createRoom to initialise)
  }

  async delete(roomId: string): Promise<void> {
    this.runtimes.delete(roomId);
  }

  async findByToken(token: string): Promise<GameRoom | null> {
    for (const rt of this.runtimes.values()) {
      if (rt.players.some(p => p.reconnectToken === token)) {
        return toGameRoom(rt);
      }
    }
    return null;
  }

  async all(): Promise<GameRoom[]> {
    return Array.from(this.runtimes.values()).map(toGameRoom);
  }
}

// ---- Room creation helpers ----

export function createEngineContext(): EngineContext {
  const runtimes = new Map<string, RoomRuntime>();
  return { store: new InMemoryRoomStore(runtimes), runtimes };
}

export function createRoom(ctx: EngineContext): RoomRuntime {
  const id = uuid().slice(0, 8).toUpperCase();
  const room: RoomRuntime = {
    ...fromGameRoom({
      id,
      stateVersion: 0,
      state: initGameState(GAME_CONFIG),
      players: [],
      hasAI: false,
      aiColor: null,
      secondsRemaining: GAME_CONFIG.moveTimerSeconds,
    }),
  };
  ctx.runtimes.set(id, room);
  return room;
}

export function addPlayer(rt: RoomRuntime, socketId: string): Color | null {
  if (rt.players.length >= 2) return null;
  const color: Color =
    rt.players.length === 0
      ? Math.random() < 0.5 ? 'white' : 'black'
      : rt.players[0].color === 'white' ? 'black' : 'white';

  const token = uuid();
  const record: PlayerRecord = { color, reconnectToken: token, connected: true };
  rt.players.push(record);
  rt.socketToColor.set(socketId, color);
  rt.colorToSocket.set(color, socketId);
  return color;
}

export function reconnectPlayer(
  rt: RoomRuntime,
  socketId: string,
  token: string
): Color | null {
  const record = rt.players.find(p => p.reconnectToken === token);
  if (!record) return null;

  const old = rt.colorToSocket.get(record.color);
  if (old) rt.socketToColor.delete(old);

  record.connected = true;
  rt.socketToColor.set(socketId, record.color);
  rt.colorToSocket.set(record.color, socketId);

  const timer = rt.reconnectTimers.get(record.color);
  if (timer) { clearTimeout(timer); rt.reconnectTimers.delete(record.color); }

  return record.color;
}

export function getRuntime(ctx: EngineContext, roomId: string): RoomRuntime | null {
  return ctx.runtimes.get(roomId) ?? null;
}

export function getRuntimeBySocketId(
  ctx: EngineContext,
  socketId: string
): RoomRuntime | null {
  for (const rt of ctx.runtimes.values()) {
    if (rt.socketToColor.has(socketId)) return rt;
  }
  return null;
}
