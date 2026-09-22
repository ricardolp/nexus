import { create } from 'zustand';

interface ProductTourState {
  /** Incremented to request a tour start (auto or manual restart). */
  startRequestId: number;
  requestStart: () => void;
}

export const useProductTourStore = create<ProductTourState>((set) => ({
  startRequestId: 0,
  requestStart: () => set((s) => ({ startRequestId: s.startRequestId + 1 }))
}));
