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
      // Existing session takes priority — bring the player back to their game.
      useGameStore.getState().setReconnecting(true);
      joinRoom(session.roomId, session.reconnectToken).catch(() => {
        // Room expired or token invalid — wipe the session and fall through.
        clearSession();
        useGameStore.getState().setReconnecting(false);
        // If there's a different room in the URL, join that as a fresh player.
        if (roomParam && roomParam !== session.roomId) {
          joinRoom(roomParam).catch(console.error);
        }
      });
    } else if (roomParam) {
      // No saved session — fresh join via shared link.
      joinRoom(roomParam).catch(console.error);
    }
    // No session and no URL param → just show the lobby.
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
