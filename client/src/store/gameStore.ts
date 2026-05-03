import { create } from 'zustand';
import { Color, GameState, Position, UpgradeConfig } from '@hexchess/shared';

export interface GameStore {
  // Server-synced state
  gameState: GameState | null;
  myColor: Color | null;
  roomId: string | null;
  shareUrl: string | null;

  // Timer
  secondsRemaining: number;
  timerColor: Color | null;

  // UI state (client-only)
  selectedPieceId: string | null;
  validMoves: Position[];

  // Promotion flow
  promotionPending: boolean;
  promotionPieceId: string | null;
  promotionOptions: UpgradeConfig[];

  // Connection
  connected: boolean;
  opponentConnected: boolean;
  opponentDisconnected: boolean;

  // Actions
  setGameState: (gs: GameState) => void;
  setMyColor: (color: Color) => void;
  setRoomId: (id: string) => void;
  setShareUrl: (url: string) => void;
  setTimerUpdate: (seconds: number, color: Color) => void;
  setConnected: (v: boolean) => void;
  setOpponentConnected: (v: boolean) => void;
  setOpponentDisconnected: (v: boolean) => void;
  selectPiece: (pieceId: string | null, validMoves: Position[]) => void;
  setPromotionRequired: (pieceId: string, options: UpgradeConfig[]) => void;
  clearPromotion: () => void;
  reset: () => void;
}

const initialState = {
  gameState: null,
  myColor: null,
  roomId: null,
  shareUrl: null,
  secondsRemaining: 0,
  timerColor: null,
  selectedPieceId: null,
  validMoves: [],
  promotionPending: false,
  promotionPieceId: null,
  promotionOptions: [],
  connected: false,
  opponentConnected: false,
  opponentDisconnected: false,
};

export const useGameStore = create<GameStore>((set) => ({
  ...initialState,

  setGameState: (gs) => set({ gameState: gs }),
  setMyColor: (color) => set({ myColor: color }),
  setRoomId: (id) => set({ roomId: id }),
  setShareUrl: (url) => set({ shareUrl: url }),
  setTimerUpdate: (seconds, color) => set({ secondsRemaining: seconds, timerColor: color }),
  setConnected: (v) => set({ connected: v }),
  setOpponentConnected: (v) => set({ opponentConnected: v }),
  setOpponentDisconnected: (v) => set({ opponentDisconnected: v }),

  selectPiece: (pieceId, validMoves) =>
    set({ selectedPieceId: pieceId, validMoves }),

  setPromotionRequired: (pieceId, options) =>
    set({ promotionPending: true, promotionPieceId: pieceId, promotionOptions: options }),

  clearPromotion: () =>
    set({ promotionPending: false, promotionPieceId: null, promotionOptions: [] }),

  reset: () => set(initialState),
}));
