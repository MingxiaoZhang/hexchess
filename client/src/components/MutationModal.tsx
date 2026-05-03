import { useEffect, useState } from 'react';
import { PieceType, TriggerType, UpgradeConfig } from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';
import { acceptMutation, declineMutation } from '../socket/client';

const MUTATION_TIMER = 15;

const TRIGGER_LABELS: Record<TriggerType, string> = {
  pawn_advance:    'Pawn crossed the halfway line!',
  knight_captures: 'Knight captured 2 pieces!',
  bishop_revenge:  "Bishop's partner was captured — revenge earned!",
  rook_opposition: 'Rook faces the opponent\'s rook on the same file!',
  queen_checks:    'Queen delivered check twice!',
};

const PIECE_SYMBOLS: Record<PieceType, string> = {
  pawn: '♟', rook: '♜', knight: '♞', bishop: '♝', queen: '♛', king: '♚',
};

export function MutationModal(): JSX.Element | null {
  const mutationPending = useGameStore(s => s.mutationPending);
  const mutationPieceId = useGameStore(s => s.mutationPieceId);
  const mutationOptions = useGameStore(s => s.mutationOptions);
  const gameState = useGameStore(s => s.gameState);
  const myColor = useGameStore(s => s.myColor);
  const roomId = useGameStore(s => s.roomId);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(MUTATION_TIMER);

  // Resolve the piece type from the current mutation queue entry
  const currentMutation = gameState?.mutationQueue[0] ?? null;
  const pieceType = currentMutation?.pieceType ?? null;
  const triggerType = currentMutation?.triggerType ?? null;

  useEffect(() => {
    if (!mutationPending) return;
    setTimeLeft(MUTATION_TIMER);
    setSelectedId(mutationOptions[0]?.id ?? null);
  }, [mutationPending, mutationOptions]);

  useEffect(() => {
    if (!mutationPending) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          // Timer expired — auto-decline
          if (mutationPieceId && roomId) declineMutation(roomId, mutationPieceId);
        }
        return Math.max(0, t - 1);
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mutationPending]);

  if (!mutationPending || !roomId || !mutationPieceId || !pieceType || !triggerType) return null;

  function handleAccept(): void {
    if (!roomId || !mutationPieceId || !selectedId) return;
    acceptMutation(roomId, mutationPieceId, selectedId);
  }

  function handleDecline(): void {
    if (!roomId || !mutationPieceId) return;
    declineMutation(roomId, mutationPieceId);
  }

  const colorLabel = myColor === 'white' ? 'White' : 'Black';
  const isUrgent = timeLeft <= 5;

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <div style={styles.header}>
          <div style={styles.pieceIcon}>{PIECE_SYMBOLS[pieceType]}</div>
          <div>
            <div style={styles.title}>Mutation Available</div>
            <div style={styles.subtitle}>{colorLabel}'s {pieceType}</div>
          </div>
          <div style={{ ...styles.timer, color: isUrgent ? '#ff4444' : '#ff8800' }}>
            {timeLeft}s
          </div>
        </div>

        <div style={styles.triggerLabel}>
          {TRIGGER_LABELS[triggerType]}
        </div>

        <div style={styles.section}>
          <div style={styles.sectionLabel}>Choose a mutation</div>
          {mutationOptions.length === 0 && (
            <div style={styles.noOptions}>No mutations available.</div>
          )}
          <div style={styles.optionsGrid}>
            {mutationOptions.map((opt, i) => (
              <MutationCard
                key={`${opt.id}-${i}`}
                option={opt}
                selected={selectedId === opt.id}
                onSelect={() => setSelectedId(opt.id)}
              />
            ))}
          </div>
        </div>

        <div style={styles.actions}>
          <button style={styles.declineBtn} onClick={handleDecline}>
            Decline
          </button>
          <button
            style={{ ...styles.acceptBtn, opacity: selectedId ? 1 : 0.5 }}
            onClick={handleAccept}
            disabled={!selectedId}
          >
            Accept Mutation
          </button>
        </div>

        <div style={styles.warning}>
          Auto-declines in {timeLeft}s if no selection made.
        </div>
      </div>
    </div>
  );
}

function MutationCard({
  option,
  selected,
  onSelect,
}: {
  option: UpgradeConfig;
  selected: boolean;
  onSelect: () => void;
}): JSX.Element {
  return (
    <button
      onClick={onSelect}
      style={{
        ...cardStyles.card,
        ...(selected ? cardStyles.cardSelected : {}),
      }}
    >
      <div style={cardStyles.icon}>☢</div>
      <div style={cardStyles.name}>{option.name}</div>
      <div style={cardStyles.desc}>{option.description}</div>
    </button>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.8)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1020',
    border: '2px solid #ff4400',
    borderRadius: '12px',
    padding: '28px 32px',
    width: '520px',
    maxWidth: '95vw',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
    boxShadow: '0 0 40px rgba(255,68,0,0.3)',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  pieceIcon: {
    fontSize: '48px',
    lineHeight: 1,
    filter: 'drop-shadow(0 0 8px rgba(255,100,0,0.8))',
  },
  title: {
    fontSize: '20px',
    fontWeight: 'bold' as const,
    color: '#ff8844',
  },
  subtitle: {
    fontSize: '14px',
    color: '#aaa',
    textTransform: 'capitalize' as const,
  },
  timer: {
    marginLeft: 'auto',
    fontSize: '32px',
    fontFamily: 'monospace',
    fontWeight: 'bold' as const,
  },
  triggerLabel: {
    background: 'rgba(255,100,0,0.12)',
    border: '1px solid rgba(255,100,0,0.3)',
    borderRadius: '6px',
    padding: '10px 14px',
    fontSize: '14px',
    color: '#ffbb88',
    textAlign: 'center' as const,
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '12px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  noOptions: {
    color: '#666',
    fontSize: '14px',
  },
  optionsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
    gap: '10px',
  },
  actions: {
    display: 'flex',
    gap: '12px',
  },
  declineBtn: {
    flex: 1,
    padding: '12px',
    background: 'transparent',
    color: '#888',
    border: '1px solid #555',
    borderRadius: '8px',
    fontSize: '15px',
    cursor: 'pointer',
  },
  acceptBtn: {
    flex: 2,
    padding: '12px',
    background: '#ff4400',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '15px',
    fontWeight: 'bold' as const,
    cursor: 'pointer',
  },
  warning: {
    fontSize: '12px',
    color: '#555',
    textAlign: 'center' as const,
  },
};

const cardStyles = {
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '14px',
    background: '#2a1a1a',
    border: '2px solid #553333',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#ccc',
    gap: '8px',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s',
  },
  cardSelected: {
    borderColor: '#ff4400',
    background: '#3a1a0a',
    boxShadow: '0 0 12px rgba(255,68,0,0.3)',
  },
  icon: {
    fontSize: '24px',
    color: '#ff6600',
  },
  name: {
    fontSize: '14px',
    fontWeight: 'bold' as const,
    color: '#ff8844',
  },
  desc: {
    fontSize: '11px',
    color: '#888',
    lineHeight: 1.4,
  },
};
