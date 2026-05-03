import { useEffect } from 'react';
import { useGameStore } from './store/gameStore';
import { getSocket, joinRoom } from './socket/client';
import { Lobby } from './components/Lobby';
import { GameScreen } from './components/GameScreen';

export function App(): JSX.Element {
  const gameState = useGameStore(s => s.gameState);
  const myColor = useGameStore(s => s.myColor);

  // Initialize socket connection and auto-join from URL param
  useEffect(() => {
    getSocket(); // establishes connection

    const params = new URLSearchParams(window.location.search);
    const roomParam = params.get('room');
    if (roomParam) {
      joinRoom(roomParam.toUpperCase()).catch(console.error);
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
