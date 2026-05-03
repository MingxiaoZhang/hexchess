import { Color } from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

interface HUDProps {
  myColor: Color;
}

export function HUD({ myColor }: HUDProps): JSX.Element {
  const gameState = useGameStore(s => s.gameState);
  const secondsRemaining = useGameStore(s => s.secondsRemaining);
  const timerColor = useGameStore(s => s.timerColor);
  const opponentDisconnected = useGameStore(s => s.opponentDisconnected);

  const opponentColor: Color = myColor === 'white' ? 'black' : 'white';
  const isMyTurn = gameState?.currentTurn === myColor;
  const isTimerMine = timerColor === myColor;
  const urgent = secondsRemaining <= 10 && isTimerMine;

  return (
    <div style={styles.hud}>
      {/* Opponent info */}
      <div style={styles.playerRow}>
        <div style={{ ...styles.colorDot, background: opponentColor === 'white' ? '#f0e6c8' : '#2a2a2a', border: '2px solid #888' }} />
        <span style={styles.playerLabel}>
          {opponentColor.charAt(0).toUpperCase() + opponentColor.slice(1)}
          {opponentDisconnected && <span style={styles.disconnected}> (disconnected)</span>}
        </span>
        {!isMyTurn && gameState?.phase === 'active' && (
          <div style={{ ...styles.timer, color: urgent ? '#ff4444' : '#e0d0a0', borderColor: urgent ? '#ff4444' : '#888' }}>
            {isTimerMine ? '—' : formatTime(secondsRemaining)}
          </div>
        )}
      </div>

      {/* Turn indicator */}
      <div style={styles.turnBanner}>
        {gameState?.phase === 'active' && (
          <span style={{ color: isMyTurn ? '#ffd700' : '#888' }}>
            {isMyTurn ? 'Your turn' : "Opponent's turn"}
          </span>
        )}
        {gameState?.phase === 'promotion' && (
          <span style={{ color: '#ffd700' }}>Choose upgrade…</span>
        )}
        {gameState?.phase === 'complete' && (
          <span style={{ color: '#ffd700' }}>Game over</span>
        )}
      </div>

      {/* My info */}
      <div style={styles.playerRow}>
        <div style={{ ...styles.colorDot, background: myColor === 'white' ? '#f0e6c8' : '#2a2a2a', border: '2px solid #888' }} />
        <span style={styles.playerLabel}>
          {myColor.charAt(0).toUpperCase() + myColor.slice(1)} (you)
        </span>
        {isMyTurn && gameState?.phase === 'active' && (
          <div style={{ ...styles.timer, color: urgent ? '#ff4444' : '#e0d0a0', borderColor: urgent ? '#ff4444' : '#888' }}>
            {formatTime(secondsRemaining)}
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  hud: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
    padding: '12px',
    background: 'rgba(20, 20, 35, 0.85)',
    borderRadius: '8px',
    minWidth: '180px',
    userSelect: 'none' as const,
  },
  playerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  colorDot: {
    width: '16px',
    height: '16px',
    borderRadius: '50%',
    flexShrink: 0,
  },
  playerLabel: {
    fontSize: '14px',
    color: '#ccc',
    flex: 1,
  },
  timer: {
    fontSize: '20px',
    fontVariantNumeric: 'tabular-nums',
    fontFamily: 'monospace',
    border: '1px solid #888',
    borderRadius: '4px',
    padding: '2px 8px',
    minWidth: '52px',
    textAlign: 'right' as const,
  },
  turnBanner: {
    textAlign: 'center' as const,
    fontSize: '13px',
    padding: '4px 0',
    borderTop: '1px solid #444',
    borderBottom: '1px solid #444',
  },
  disconnected: {
    color: '#ff6666',
    fontSize: '12px',
  },
};
