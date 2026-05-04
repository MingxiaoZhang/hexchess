import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { getSocket, joinRoom, loadSession, clearSession } from './socket/client';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';

export function App(): JSX.Element {
  const gameState = useGameStore(s => s.gameState);
  const myColor = useGameStore(s => s.myColor);

  useEffect(() => {
    getSocket();

    const session = loadSession();
    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room')?.toUpperCase() ?? null;

    if (session) {
      // Always restore the saved session. A stored session means this person
      // is already in a game (or waiting for one they created). Prevent them
      // from accidentally joining a different room by ignoring URL params here.
      useGameStore.getState().setReconnecting(true);
      joinRoom(session.roomId, session.reconnectToken).catch(() => {
        clearSession();
        useGameStore.getState().setReconnecting(false);
        // Session was stale — if URL points to a different room, join that fresh.
        if (roomParam && roomParam !== session.roomId) {
          joinRoom(roomParam).catch(console.error);
        }
      });
    } else if (roomParam) {
      // No saved session — fresh join via shared link.
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
