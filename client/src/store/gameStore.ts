import { create } from 'zustand';
import { Color, GameState, MutationOutcomePayload, Position, UpgradeConfig } from '@hexchess/shared';

export interface MutationToast {
  pieceType: string;
  accepted: boolean;
  mutationName?: string;
  ownerColor: Color;
}

export interface GameStore {
  // Server-synced state
  gameState: GameState | null;
  myColor: Color | null;
  roomId: string | null;
  shareUrl: string | null;
  vsAI: boolean;

  // Timer
  secondsRemaining: number;
  timerColor: Color | null;

  // UI state
  selectedPieceId: string | null;
  validMoves: Position[];

  // Promotion flow
  promotionPending: boolean;
  promotionPieceId: string | null;
  promotionOptions: UpgradeConfig[];

  // V2: mutation flow
  mutationPending: boolean;
  mutationPieceId: string | null;
  mutationOptions: UpgradeConfig[];
  mutationToast: MutationToast | null; // brief notification shown to both players

  // Connection
  connected: boolean;
  opponentConnected: boolean;
  opponentDisconnected: boolean;

  // Actions
  setGameState: (gs: GameState) => void;
  setMyColor: (color: Color) => void;
  setRoomId: (id: string) => void;
  setShareUrl: (url: string) => void;
  setVsAI: (v: boolean) => void;
  setTimerUpdate: (seconds: number, color: Color) => void;
  setConnected: (v: boolean) => void;
  setOpponentConnected: (v: boolean) => void;
  setOpponentDisconnected: (v: boolean) => void;
  selectPiece: (pieceId: string | null, validMoves: Position[]) => void;
  setPromotionRequired: (pieceId: string, options: UpgradeConfig[]) => void;
  clearPromotion: () => void;
  setMutationRequired: (pieceId: string, options: UpgradeConfig[]) => void;
  clearMutation: () => void;
  setMutationToast: (toast: MutationToast | null) => void;
  reset: () => void;
}

const initialState = {
  gameState: null,
  myColor: null,
  roomId: null,
  shareUrl: null,
  vsAI: false,
  secondsRemaining: 0,
  timerColor: null,
  selectedPieceId: null,
  validMoves: [],
  promotionPending: false,
  promotionPieceId: null,
  promotionOptions: [],
  mutationPending: false,
  mutationPieceId: null,
  mutationOptions: [],
  mutationToast: null,
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
  setVsAI: (v) => set({ vsAI: v }),
  setTimerUpdate: (seconds, color) => set({ secondsRemaining: seconds, timerColor: color }),
  setConnected: (v) => set({ connected: v }),
  setOpponentConnected: (v) => set({ opponentConnected: v }),
  setOpponentDisconnected: (v) => set({ opponentDisconnected: v }),
  selectPiece: (pieceId, validMoves) => set({ selectedPieceId: pieceId, validMoves }),
  setPromotionRequired: (pieceId, options) =>
    set({ promotionPending: true, promotionPieceId: pieceId, promotionOptions: options }),
  clearPromotion: () =>
    set({ promotionPending: false, promotionPieceId: null, promotionOptions: [] }),
  setMutationRequired: (pieceId, options) =>
    set({ mutationPending: true, mutationPieceId: pieceId, mutationOptions: options }),
  clearMutation: () =>
    set({ mutationPending: false, mutationPieceId: null, mutationOptions: [] }),
  setMutationToast: (toast) => set({ mutationToast: toast }),
  reset: () => set(initialState),
}));
