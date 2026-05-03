import { useEffect, useState } from 'react';
import { PieceType, UpgradeConfig } from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';
import { choosePromotion } from '../socket/client';

const PROMOTION_TIMEOUT = 30;

const PIECE_OPTIONS: { type: PieceType; label: string; symbol: string }[] = [
  { type: 'queen',  label: 'Queen',  symbol: '♛' },
  { type: 'rook',   label: 'Rook',   symbol: '♜' },
  { type: 'bishop', label: 'Bishop', symbol: '♝' },
  { type: 'knight', label: 'Knight', symbol: '♞' },
];

interface PromotionModalProps {
  onChosen?: () => void;
}

export function PromotionModal({ onChosen }: PromotionModalProps): JSX.Element | null {
  const promotionPending = useGameStore(s => s.promotionPending);
  const promotionPieceId = useGameStore(s => s.promotionPieceId);
  const promotionOptions = useGameStore(s => s.promotionOptions);
  const roomId = useGameStore(s => s.roomId);

  const [selectedPiece, setSelectedPiece] = useState<PieceType>('queen');
  const [selectedUpgrade, setSelectedUpgrade] = useState<UpgradeConfig | null>(null);
  const [timeLeft, setTimeLeft] = useState(PROMOTION_TIMEOUT);

  useEffect(() => {
    if (!promotionPending) return;
    setTimeLeft(PROMOTION_TIMEOUT);
    setSelectedPiece('queen');
    setSelectedUpgrade(promotionOptions[0] ?? null);
  }, [promotionPending, promotionOptions]);

  useEffect(() => {
    if (!promotionPending) return;
    const interval = setInterval(() => {
      setTimeLeft(t => {
        if (t <= 1) {
          clearInterval(interval);
          handleConfirm('queen', promotionOptions[0] ?? null);
        }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [promotionPending]);

  if (!promotionPending || !roomId || !promotionPieceId) return null;

  function handleConfirm(pieceType: PieceType, upgrade: UpgradeConfig | null): void {
    if (!roomId) return;
    choosePromotion(roomId, pieceType, upgrade?.id ?? '');
    if (onChosen) onChosen();
  }

  return (
    <div style={styles.overlay}>
      <div style={styles.modal}>
        <h2 style={styles.title}>Pawn Promotion</h2>
        <div style={styles.timer}>
          {timeLeft}s
        </div>

        {/* Piece type selection */}
        <div style={styles.section}>
          <div style={styles.sectionLabel}>Choose piece</div>
          <div style={styles.pieceGrid}>
            {PIECE_OPTIONS.map(opt => (
              <button
                key={opt.type}
                onClick={() => setSelectedPiece(opt.type)}
                style={{
                  ...styles.pieceBtn,
                  ...(selectedPiece === opt.type ? styles.pieceBtnSelected : {}),
                }}
              >
                <span style={styles.pieceSymbol}>{opt.symbol}</span>
                <span style={styles.pieceLabel}>{opt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Upgrade selection */}
        {promotionOptions.length > 0 && (
          <div style={styles.section}>
            <div style={styles.sectionLabel}>Choose upgrade</div>
            <div style={styles.upgradeGrid}>
              {promotionOptions.map((opt, i) => (
                <button
                  key={`${opt.id}-${i}`}
                  onClick={() => setSelectedUpgrade(opt)}
                  style={{
                    ...styles.upgradeCard,
                    ...(selectedUpgrade?.id === opt.id ? styles.upgradeCardSelected : {}),
                  }}
                >
                  <div style={styles.upgradeName}>{opt.name}</div>
                  <div style={styles.upgradeDesc}>{opt.description}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          style={styles.confirmBtn}
          onClick={() => handleConfirm(selectedPiece, selectedUpgrade)}
        >
          Confirm
        </button>
      </div>
    </div>
  );
}

const styles = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    background: 'rgba(0,0,0,0.75)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  },
  modal: {
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '12px',
    padding: '28px 32px',
    width: '480px',
    maxWidth: '95vw',
    color: '#e0e0e0',
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '20px',
  },
  title: {
    margin: 0,
    fontSize: '22px',
    color: '#ffd700',
    textAlign: 'center' as const,
  },
  timer: {
    textAlign: 'center' as const,
    fontSize: '28px',
    fontFamily: 'monospace',
    color: '#ff8800',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '13px',
    color: '#888',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
  },
  pieceGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '8px',
  },
  pieceBtn: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    padding: '10px 4px',
    background: '#2a2a40',
    border: '2px solid #444',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#ccc',
    gap: '4px',
    transition: 'border-color 0.15s',
  },
  pieceBtnSelected: {
    borderColor: '#ffd700',
    background: '#2a2a50',
  },
  pieceSymbol: {
    fontSize: '28px',
  },
  pieceLabel: {
    fontSize: '11px',
    color: '#aaa',
  },
  upgradeGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '10px',
  },
  upgradeCard: {
    display: 'flex',
    flexDirection: 'column' as const,
    padding: '12px',
    background: '#2a2a40',
    border: '2px solid #444',
    borderRadius: '8px',
    cursor: 'pointer',
    color: '#ccc',
    gap: '6px',
    textAlign: 'left' as const,
    transition: 'border-color 0.15s',
  },
  upgradeCardSelected: {
    borderColor: '#ff4444',
    background: '#3a1a1a',
  },
  upgradeName: {
    fontSize: '14px',
    fontWeight: 'bold',
    color: '#ffa0a0',
  },
  upgradeDesc: {
    fontSize: '11px',
    color: '#888',
    lineHeight: 1.4,
  },
  confirmBtn: {
    padding: '12px',
    background: '#ffd700',
    color: '#1a1a1a',
    border: 'none',
    borderRadius: '8px',
    fontSize: '16px',
    fontWeight: 'bold',
    cursor: 'pointer',
  },
};
