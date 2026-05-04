import { useState } from 'react';
import { createRoom, joinRoom } from '../socket/client';
import { useGameStore } from '../store/gameStore';

export function Lobby(): JSX.Element {
  const [joinRoomId, setJoinRoomId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const shareUrl = useGameStore(s => s.shareUrl);
  const roomId = useGameStore(s => s.roomId);
  const connected = useGameStore(s => s.connected);
  const reconnecting = useGameStore(s => s.reconnecting);

  // Reconstruct the share URL if roomId is known but shareUrl wasn't set in this tab
  // (happens when a creator reconnects via token in a second tab)
  const displayUrl = shareUrl ?? (roomId ? `${window.location.origin}/?room=${roomId}` : null);

  async function handleCreate() {
    setLoading(true);
    setError('');
    try {
      await createRoom(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handlePlayAI() {
    setLoading(true);
    setError('');
    try {
      await createRoom(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    const id = joinRoomId.trim().toUpperCase();
    if (!id) { setError('Enter a room code'); return; }
    setLoading(true);
    setError('');
    try {
      await joinRoom(id);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={styles.root}>
      <div style={styles.card}>
        <h1 style={styles.title}>Hexchess</h1>
        <p style={styles.tagline}>Chess, upgraded.</p>

        {(!connected || reconnecting) && (
          <div style={styles.status}>
            {reconnecting ? 'Rejoining your game…' : 'Connecting…'}
          </div>
        )}

        {connected && !reconnecting && !roomId && (
          <>
            <button style={styles.btnPrimary} onClick={handleCreate} disabled={loading}>
              {loading ? 'Creating…' : 'Play vs Friend'}
            </button>

            <button style={styles.btnAI} onClick={handlePlayAI} disabled={loading}>
              {loading ? 'Starting…' : 'Play vs AI'}
            </button>

            <div style={styles.divider}>or join a friend's game</div>

            <div style={styles.joinRow}>
              <input
                style={styles.input}
                placeholder="Room code"
                value={joinRoomId}
                onChange={e => setJoinRoomId(e.target.value.toUpperCase())}
                maxLength={8}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
              />
              <button style={styles.btnSecondary} onClick={handleJoin} disabled={loading}>
                Join
              </button>
            </div>

            {error && <div style={styles.error}>{error}</div>}
          </>
        )}

        {displayUrl && (
          <div style={styles.waitingSection}>
            <div style={styles.waitingLabel}>Waiting for opponent…</div>
            <div style={styles.roomCode}>{roomId}</div>
            <div style={styles.shareLabel}>Share this link:</div>
            <div style={styles.shareUrl}>{displayUrl}</div>
            <button
              style={styles.btnSecondary}
              onClick={() => navigator.clipboard.writeText(displayUrl)}
            >
              Copy link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const styles = {
  root: {
    width: '100%',
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    background: 'rgba(20,20,35,0.9)',
    border: '1px solid #444',
    borderRadius: '16px',
    padding: '40px 48px',
    width: '400px',
    maxWidth: '95vw',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
    alignItems: 'stretch',
  },
  title: {
    margin: 0,
    fontSize: '36px',
    color: '#ffd700',
    textAlign: 'center' as const,
    letterSpacing: '0.05em',
  },
  tagline: {
    margin: 0,
    color: '#888',
    textAlign: 'center' as const,
    fontSize: '14px',
    marginBottom: '8px',
  },
  btnPrimary: {
    padding: '14px',
    background: '#ffd700',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  btnAI: {
    padding: '12px',
    background: 'transparent',
    color: '#ff8844',
    border: '1px solid #ff5500',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  btnSecondary: {
    padding: '10px 16px',
    background: 'transparent',
    color: '#ccc',
    border: '1px solid #555',
    borderRadius: '8px',
    fontSize: '14px',
    cursor: 'pointer',
  },
  divider: {
    textAlign: 'center' as const,
    color: '#555',
    fontSize: '13px',
  },
  joinRow: {
    display: 'flex',
    gap: '8px',
  },
  input: {
    flex: 1,
    padding: '10px 12px',
    background: '#0a0a18',
    border: '1px solid #555',
    borderRadius: '8px',
    color: '#e0e0e0',
    fontSize: '16px',
    letterSpacing: '0.1em',
    outline: 'none',
    fontFamily: 'monospace',
  },
  error: {
    color: '#ff6666',
    fontSize: '13px',
    textAlign: 'center' as const,
  },
  status: {
    textAlign: 'center' as const,
    color: '#888',
    fontSize: '14px',
  },
  waitingSection: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '12px',
    alignItems: 'center',
  },
  waitingLabel: {
    color: '#ffd700',
    fontSize: '16px',
  },
  roomCode: {
    fontFamily: 'monospace',
    fontSize: '28px',
    letterSpacing: '0.2em',
    color: '#fff',
    background: '#0a0a18',
    padding: '8px 20px',
    borderRadius: '6px',
    border: '1px solid #555',
  },
  shareLabel: {
    color: '#666',
    fontSize: '12px',
  },
  shareUrl: {
    fontFamily: 'monospace',
    fontSize: '12px',
    color: '#aaa',
    wordBreak: 'break-all' as const,
    textAlign: 'center' as const,
  },
};
