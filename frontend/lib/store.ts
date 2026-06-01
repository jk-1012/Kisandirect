/**
 * Cart Store using Zustand
 * Client-side state management with localStorage persistence
 */

'use client';

import { create } from 'zustand';
import { persist, devtools } from 'zustand/middleware';
import { CartItem, Listing } from './types';

interface CartState {
  items: CartItem[];
  addItem: (listing: Listing, quantity: number) => void;
  updateItem: (listingId: string, quantity: number) => void;
  removeItem: (listingId: string) => void;
  clearCart: () => void;
  getTotal: () => number;
  getTotalItems: () => number;
}

export const useCartStore = create<CartState>()(
  devtools(
    persist(
      (set, get) => ({
        items: [],

        addItem: (listing: Listing, quantity: number) => {
          set((state) => {
            const existingItem = state.items.find((i) => i.listingId === listing.id);

            if (existingItem) {
              return {
                items: state.items.map((i) =>
                  i.listingId === listing.id
                    ? { ...i, quantity: Math.min(i.quantity + quantity, listing.maxOrderQuantity || 9999) }
                    : i,
                ),
              };
            }

            return {
              items: [
                ...state.items,
                {
                  listingId: listing.id,
                  quantity: Math.min(quantity, listing.maxOrderQuantity || 9999),
                  unitPrice: listing.unitPrice,
                  listing,
                },
              ],
            };
          });
        },

        updateItem: (listingId: string, quantity: number) => {
          set((state) => {
            if (quantity <= 0) {
              return { items: state.items.filter((i) => i.listingId !== listingId) };
            }

            return {
              items: state.items.map((i) =>
                i.listingId === listingId
                  ? { ...i, quantity: Math.min(quantity, i.listing.maxOrderQuantity || 9999) }
                  : i,
              ),
            };
          });
        },

        removeItem: (listingId: string) => {
          set((state) => ({
            items: state.items.filter((i) => i.listingId !== listingId),
          }));
        },

        clearCart: () => {
          set({ items: [] });
        },

        getTotal: () => {
          return get().items.reduce((total, item) => total + item.quantity * item.unitPrice, 0);
        },

        getTotalItems: () => {
          return get().items.reduce((total, item) => total + item.quantity, 0);
        },
      }),
      {
        name: 'cart-store',
        partialize: (state) => ({ items: state.items }),
      },
    ),
  ),
);
