import { create } from 'zustand';

interface AuthState {
  phone?: string;
  accessToken?: string;
  refreshToken?: string;
  setAuth: (payload: Partial<AuthState>) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  setAuth: (payload) => set(payload)
}));
