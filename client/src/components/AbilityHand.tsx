// Displays the player's 3 ability cards. Built for up to 5 cards (V4+).
// Clicking a card arms it for use on the board.

import { AbilityCard, AbilityId, Color } from '@hexchess/shared';
import { useGameStore } from '../store/gameStore';
import { declineAbilityPending } from '../socket/client';

// These match ABILITY_CONFIGS on the server — display-only, safe to duplicate here.
const ABILITY_DISPLAY: Record<AbilityId, { name: string; icon: string; color: string }> = {
  berserk:     { name: 'Berserk',     icon: '⚔', color: '#e55' },
  long_strike: { name: 'Long Strike', icon: '🎯', color: '#e85' },
  phantom:     { name: 'Phantom',     icon: '👻', color: '#88d' },
  anchor:      { name: 'Anchor',      icon: '⚓', color: '#5ae' },
  echo:        { name: 'Echo',        icon: '🔁', color: '#5d5' },
  surge:       { name: 'Surge',       icon: '💨', color: '#fa0' },
};

// Shown when opponent's card is hidden
const HIDDEN_DISPLAY = { name: '???', icon: '?', color: '#555' };

interface AbilityHandProps {
  hand: AbilityCard[];
  myColor: Color;
  isMyTurn: boolean;
  roomId: string | null;
  isOpponent?: boolean;
}

export function AbilityHand({ hand, isMyTurn, roomId, isOpponent = false }: AbilityHandProps): JSX.Element {
  const selectedAbility = useGameStore(s => s.selectedAbility);
  const gameState = useGameStore(s => s.gameState);
  const { setSelectedAbility } = useGameStore();

  const isBerserkPending = gameState?.phase === 'ability_pending' && gameState?.abilityPending?.type === 'berserk';
  const isEchoPending = gameState?.phase === 'ability_pending' && gameState?.abilityPending?.type === 'echo';

  function handleCardClick(card: AbilityCard): void {
    if (isOpponent) return;
    if (!isMyTurn && gameState?.phase !== 'ability_pending') return;
    if (card.usesRemaining === 0) return;
    if (card.id === '?' as AbilityId) return;

    if (selectedAbility === card.id) {
      setSelectedAbility(null); // deselect
    } else {
      setSelectedAbility(card.id);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.label}>
        {isOpponent ? 'Opponent abilities' : 'Your abilities'}
        {isBerserkPending && !isOpponent && (
          <span style={styles.pendingBadge}>⚔ Berserk — click second capture</span>
        )}
        {isEchoPending && !isOpponent && (
          <span style={styles.pendingBadge}>🔁 Echo — use copied ability</span>
        )}
      </div>

      <div style={styles.cardRow}>
        {hand.map((card, i) => {
          const isHidden = (card.id as string) === '?';
          const display = isHidden ? HIDDEN_DISPLAY : (ABILITY_DISPLAY[card.id] ?? HIDDEN_DISPLAY);
          const exhausted = card.usesRemaining === 0;
          const isSelected = !isOpponent && selectedAbility === card.id;
          const canUse = !isOpponent && isMyTurn && !exhausted && !isHidden;

          return (
            <button
              key={`${card.id}-${i}`}
              onClick={() => handleCardClick(card)}
              style={{
                ...styles.card,
                ...(exhausted ? styles.cardExhausted : {}),
                ...(isSelected ? { ...styles.cardSelected, borderColor: display.color } : {}),
                ...(isHidden ? styles.cardHidden : {}),
                cursor: canUse ? 'pointer' : 'default',
              }}
              disabled={exhausted || isHidden || (!isMyTurn && gameState?.phase === 'active')}
            >
              <div style={{ ...styles.icon, color: exhausted ? '#555' : display.color }}>
                {display.icon}
              </div>
              <div style={{ ...styles.name, color: exhausted ? '#555' : '#ddd' }}>
                {display.name}
              </div>
              <div style={styles.uses}>
                {card.usesRemaining === null ? '∞' : card.usesRemaining === 0 ? 'used' : `×${card.usesRemaining}`}
              </div>
            </button>
          );
        })}
      </div>

      {/* Pending ability controls */}
      {(isBerserkPending || isEchoPending) && !isOpponent && roomId && (
        <button style={styles.skipBtn} onClick={() => declineAbilityPending(roomId)}>
          Skip
        </button>
      )}

      {/* Cancel ability selection */}
      {selectedAbility && !isOpponent && !isBerserkPending && !isEchoPending && (
        <div style={styles.hint}>
          Click a piece to use — or click the card again to cancel
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '6px',
    padding: '10px',
    background: 'rgba(15,15,25,0.75)',
    borderRadius: '8px',
  },
  label: {
    fontSize: '11px',
    color: '#666',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.06em',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
  pendingBadge: {
    fontSize: '11px',
    color: '#ffa040',
    background: 'rgba(255,160,64,0.15)',
    border: '1px solid rgba(255,160,64,0.4)',
    borderRadius: '4px',
    padding: '1px 6px',
  },
  cardRow: {
    display: 'flex',
    gap: '6px',
    flexWrap: 'wrap' as const,
  },
  card: {
    display: 'flex',
    flexDirection: 'column' as const,
    alignItems: 'center',
    gap: '2px',
    padding: '8px 6px',
    background: '#1a1a2e',
    border: '1px solid #444',
    borderRadius: '6px',
    minWidth: '54px',
    transition: 'border-color 0.15s, background 0.15s',
    color: '#ccc',
  },
  cardSelected: {
    background: '#1a1a40',
    boxShadow: '0 0 8px rgba(100,100,255,0.2)',
  },
  cardExhausted: {
    opacity: 0.4,
  },
  cardHidden: {
    opacity: 0.5,
    cursor: 'default' as const,
  },
  icon: {
    fontSize: '20px',
    lineHeight: 1,
  },
  name: {
    fontSize: '9px',
    textTransform: 'uppercase' as const,
    letterSpacing: '0.04em',
    whiteSpace: 'nowrap' as const,
  },
  uses: {
    fontSize: '10px',
    color: '#888',
  },
  skipBtn: {
    padding: '4px 10px',
    background: 'transparent',
    color: '#888',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '12px',
    cursor: 'pointer',
    alignSelf: 'flex-start' as const,
  },
  hint: {
    fontSize: '10px',
    color: '#555',
    fontStyle: 'italic' as const,
  },
};
