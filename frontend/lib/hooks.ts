/**
 * Custom hooks for buyer-side features
 */

'use client';

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { apiClient } from './api';
import { Listing, Order, Notification, PriceAlert } from './types';

// Listings
export function useListings(page: number = 1, filters?: Record<string, any>) {
  return useQuery({
    queryKey: ['listings', page, filters],
    queryFn: () => apiClient.getListings(page, 20, filters),
    staleTime: 1000 * 60 * 5, // 5 minutes
  });
}

export function useListingById(id: string) {
  return useQuery({
    queryKey: ['listing', id],
    queryFn: () => apiClient.getListingById(id),
    enabled: !!id,
    staleTime: 1000 * 60 * 10,
  });
}

export function useSearchListings(query: string, page: number = 1, filters?: Record<string, any>) {
  return useQuery({
    queryKey: ['search', query, page, filters],
    queryFn: () => apiClient.searchListings(query, page, filters),
    enabled: !!query,
    staleTime: 1000 * 60 * 5,
  });
}

// Orders
export function useOrders(status?: string) {
  return useQuery({
    queryKey: ['orders', status],
    queryFn: () => apiClient.getOrders(1, 10, status),
    staleTime: 1000 * 60 * 2,
  });
}

export function useOrderById(id: string) {
  return useQuery({
    queryKey: ['order', id],
    queryFn: () => apiClient.getOrderById(id),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

export function useCreateOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createOrder>[0]) =>
      apiClient.createOrder(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

export function useUpdateOrderStatus() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiClient.updateOrderStatus(id, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Cart
export function useCart() {
  return useQuery({
    queryKey: ['cart'],
    queryFn: () => apiClient.getCart(),
    staleTime: 1000 * 60,
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, quantity }: { listingId: string; quantity: number }) =>
      apiClient.addToCart(listingId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ listingId, quantity }: { listingId: string; quantity: number }) =>
      apiClient.updateCartItem(listingId, quantity),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

export function useRemoveFromCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (listingId: string) => apiClient.removeFromCart(listingId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cart'] });
    },
  });
}

// Disputes
export function useDisputes() {
  return useQuery({
    queryKey: ['disputes'],
    queryFn: () => apiClient.getDisputes(),
    staleTime: 1000 * 60 * 2,
  });
}

export function useDisputeById(id: string) {
  return useQuery({
    queryKey: ['dispute', id],
    queryFn: () => apiClient.getDisputeById(id),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

export function useCreateDispute() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createDispute>[0]) =>
      apiClient.createDispute(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['disputes'] });
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Notifications
export function useNotifications(page: number = 1) {
  return useQuery({
    queryKey: ['notifications', page],
    queryFn: () => apiClient.getNotifications(page),
    staleTime: 1000 * 30, // 30 seconds
  });
}

export function useMarkNotificationAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.markNotificationAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

export function useMarkAllNotificationsAsRead() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () => apiClient.markAllNotificationsAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });
}

// Addresses
export function useAddresses() {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: () => apiClient.getAddresses(),
    staleTime: 1000 * 60 * 10,
  });
}

export function useCreateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.createAddress(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useUpdateAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.updateAddress(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

export function useDeleteAddress() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deleteAddress(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['addresses'] });
    },
  });
}

// Price Alerts
export function usePriceAlerts() {
  return useQuery({
    queryKey: ['price-alerts'],
    queryFn: () => apiClient.getPriceAlerts(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreatePriceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createPriceAlert>[0]) =>
      apiClient.createPriceAlert(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] });
    },
  });
}

export function useDeletePriceAlert() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.deletePriceAlert(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['price-alerts'] });
    },
  });
}

// RFQ
export function useRFQs() {
  return useQuery({
    queryKey: ['rfqs'],
    queryFn: () => apiClient.getRFQs(),
    staleTime: 1000 * 60 * 2,
  });
}

export function useRFQById(id: string) {
  return useQuery({
    queryKey: ['rfq', id],
    queryFn: () => apiClient.getRFQById(id),
    enabled: !!id,
    staleTime: 1000 * 60,
  });
}

export function useCreateRFQ() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createRFQ>[0]) =>
      apiClient.createRFQ(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
    },
  });
}

export function useAcceptQuote() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ rfqId, quoteId }: { rfqId: string; quoteId: string }) =>
      apiClient.acceptQuote(rfqId, quoteId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['rfqs'] });
    },
  });
}

// Payment
export function useInitiatePayment() {
  return useMutation({
    mutationFn: ({ orderId, amount }: { orderId: string; amount: number }) =>
      apiClient.initiatePayment(orderId, amount),
  });
}

export function useVerifyPayment() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      orderId,
      paymentId,
      signature,
    }: {
      orderId: string;
      paymentId: string;
      signature: string;
    }) => apiClient.verifyPayment(orderId, paymentId, signature),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['orders'] });
    },
  });
}

// Selection
export function useSupplyForecast(cropType: string, region?: string) {
  return useQuery({
    queryKey: ['supply-forecast', cropType, region],
    queryFn: () => apiClient.getSupplyForecast(cropType, region),
    enabled: !!cropType,
    staleTime: 1000 * 60 * 60, // 1 hour
  });
}

export function usePriceHistory(cropType: string, days: number = 30) {
  return useQuery({
    queryKey: ['price-history', cropType, days],
    queryFn: () => apiClient.getPriceHistory(cropType, days),
    enabled: !!cropType,
    staleTime: 1000 * 60 * 60,
  });
}

export function useTrustScore(userId: string) {
  return useQuery({
    queryKey: ['trust-score', userId],
    queryFn: () => apiClient.getTrustScore(userId),
    enabled: !!userId,
    staleTime: 1000 * 60 * 30, // 30 minutes
  });
}

// User
export function useCurrentUser() {
  return useQuery({
    queryKey: ['current-user'],
    queryFn: () => apiClient.getCurrentUser(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useUpdateProfile() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: any) => apiClient.updateProfile(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['current-user'] });
    },
  });
}

// Subscriptions
export function useSubscriptions() {
  return useQuery({
    queryKey: ['subscriptions'],
    queryFn: () => apiClient.getSubscriptions(),
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (data: Parameters<typeof apiClient.createSubscription>[0]) =>
      apiClient.createSubscription(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useUpdateSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) =>
      apiClient.updateSubscription(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}

export function useCancelSubscription() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.cancelSubscription(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscriptions'] });
    },
  });
}
