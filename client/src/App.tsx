import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { getSocket, joinRoom, loadSession, clearSession } from './socket/client';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';

export function App(): JSX.Element {
  const gameState = useGameStore(s => s.gameState);
  const myColor = useGameStore(s => s.myColor);

  useEffect(() => {
    getSocket(); // establishes connection and attaches listeners

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room')?.toUpperCase() ?? null;

    // Check for a stored session first (handles page refresh mid-game)
    const session = loadSession();
    if (session) {
      if (!roomParam || roomParam === session.roomId) {
        // Reconnect to the existing game using the stored token
        joinRoom(session.roomId, session.reconnectToken).catch(() => {
          // Session is stale (room expired) — clear it and fall through
          clearSession();
          if (roomParam && roomParam !== session.roomId) {
            joinRoom(roomParam).catch(console.error);
          }
        });
        return;
      }
    }

    // Also check for a pending token from create_room (creator refreshed before opponent joined)
    if (roomParam) {
      try {
        const pending = JSON.parse(localStorage.getItem('hexchess_pending_token') ?? 'null') as
          { roomId: string; reconnectToken: string } | null;
        if (pending && pending.roomId === roomParam) {
          joinRoom(roomParam, pending.reconnectToken).catch(() => joinRoom(roomParam).catch(console.error));
          return;
        }
      } catch { /* ignore */ }
      joinRoom(roomParam).catch(console.error);
    }
  }, []);

  const isPlaying = gameState && myColor && gameState.phase !== 'waiting';

  return (
    <div style={{ width: '100vw', height: '100vh' }}>
      {isPlaying
        ? <GameScreen gameState={gameState} myColor={myColor} />
        : <Lobby />
      }
    </div>
  );
}
