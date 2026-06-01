/**
 * API Client for Kisandirect
 * Handles 2G optimization, caching, error handling
 */

import { ApiResponse, SearchResponse } from './types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

interface RequestConfig {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  headers?: Record<string, string>;
  body?: any;
  cache?: 'force-cache' | 'no-store' | 'reload' | 'no-cache';
  next?: { revalidate?: number };
  timeout?: number;
}

class APIClient {
  private baseURL: string;
  private defaultTimeout = 15000; // 15s for 2G

  constructor(baseURL = API_BASE) {
    this.baseURL = baseURL;
  }

  private async request<T>(
    endpoint: string,
    config: RequestConfig = {},
  ): Promise<T> {
    const {
      method = 'GET',
      body,
      cache = 'no-store',
      timeout = this.defaultTimeout,
      ...rest
    } = config;

    const url = `${this.baseURL}${endpoint}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    // Add auth token if available
    if (typeof window !== 'undefined') {
      const token = localStorage.getItem('auth_token');
      if (token) {
        headers.Authorization = `Bearer ${token}`;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
        cache: (cache as any) || undefined,
        ...rest,
      } as any);

      clearTimeout(timeoutId);

      if (!response.ok) {
        const error = await response.json().catch(() => ({
          code: `HTTP_${response.status}`,
          message: response.statusText,
        }));
        throw new Error(JSON.stringify(error));
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw new Error('Request timeout - check your internet connection');
        }
      }
      throw error;
    }
  }

  // Listings
  async getListings(
    page: number = 1,
    pageSize: number = 20,
    filters?: Record<string, any>,
  ) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...Object.fromEntries(
        Object.entries(filters || {}).map(([k, v]) => [k, String(v || '')]),
      ),
    });

    return this.request<SearchResponse<any>>(
      `/listings?${params}`,
      { cache: 'force-cache', next: { revalidate: 300 } }, // 5 min cache
    );
  }

  async getListingById(id: string) {
    return this.request<any>(`/listings/${id}`, {
      cache: 'force-cache',
      next: { revalidate: 600 },
    });
  }

  async searchListings(query: string, page: number = 1, filters?: Record<string, any>) {
    const params = new URLSearchParams({
      q: query,
      page: String(page),
      ...Object.fromEntries(
        Object.entries(filters || {}).map(([k, v]) => [k, String(v || '')]),
      ),
    });

    return this.request<SearchResponse<any>>(`/listings/search?${params}`, {
      cache: 'force-cache',
      next: { revalidate: 300 },
    });
  }

  // Orders
  async createOrder(data: {
    items: Array<{ listingId: string; quantity: number }>;
    shippingAddress: any;
    paymentMethod: string;
  }) {
    return this.request<any>('/orders', {
      method: 'POST',
      body: data,
    });
  }

  async getOrders(page: number = 1, pageSize: number = 10, status?: string) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
      ...(status && { status }),
    });

    return this.request<SearchResponse<any>>(`/orders?${params}`, {
      cache: 'no-store',
    });
  }

  async getOrderById(id: string) {
    return this.request<any>(`/orders/${id}`, {
      cache: 'no-store',
    });
  }

  async updateOrderStatus(id: string, status: string) {
    return this.request<any>(`/orders/${id}`, {
      method: 'PATCH',
      body: { status },
    });
  }

  // Cart
  async getCart() {
    return this.request<any>('/cart', {
      cache: 'no-store',
    });
  }

  async addToCart(listingId: string, quantity: number) {
    return this.request<any>('/cart/items', {
      method: 'POST',
      body: { listingId, quantity },
    });
  }

  async updateCartItem(listingId: string, quantity: number) {
    return this.request<any>(`/cart/items/${listingId}`, {
      method: 'PUT',
      body: { quantity },
    });
  }

  async removeFromCart(listingId: string) {
    return this.request<any>(`/cart/items/${listingId}`, {
      method: 'DELETE',
    });
  }

  // Payment
  async initiatePayment(orderId: string, amount: number) {
    return this.request<any>('/payments/initiate', {
      method: 'POST',
      body: { orderId, amount },
    });
  }

  async verifyPayment(orderId: string, paymentId: string, signature: string) {
    return this.request<any>('/payments/verify', {
      method: 'POST',
      body: { orderId, paymentId, signature },
    });
  }

  // Disputes
  async createDispute(data: {
    orderId: string;
    reason: string;
    description: string;
    evidence: Array<{ type: string; url?: string; text?: string }>;
  }) {
    return this.request<any>('/disputes', {
      method: 'POST',
      body: data,
    });
  }

  async getDisputes(page: number = 1, pageSize: number = 10) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.request<SearchResponse<any>>(`/disputes?${params}`, {
      cache: 'no-store',
    });
  }

  async getDisputeById(id: string) {
    return this.request<any>(`/disputes/${id}`, {
      cache: 'no-store',
    });
  }

  // Notifications
  async getNotifications(page: number = 1, pageSize: number = 20) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.request<SearchResponse<any>>(`/notifications?${params}`, {
      cache: 'no-store',
    });
  }

  async markNotificationAsRead(id: string) {
    return this.request<any>(`/notifications/${id}/read`, {
      method: 'PUT',
    });
  }

  async markAllNotificationsAsRead() {
    return this.request<any>('/notifications/read-all', {
      method: 'PUT',
    });
  }

  // Addresses
  async getAddresses() {
    return this.request<any[]>('/addresses', {
      cache: 'no-store',
    });
  }

  async createAddress(data: any) {
    return this.request<any>('/addresses', {
      method: 'POST',
      body: data,
    });
  }

  async updateAddress(id: string, data: any) {
    return this.request<any>(`/addresses/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async deleteAddress(id: string) {
    return this.request<any>(`/addresses/${id}`, {
      method: 'DELETE',
    });
  }

  // Price Alerts
  async createPriceAlert(data: {
    cropType: string;
    targetPrice: number;
    operator: 'ABOVE' | 'BELOW';
  }) {
    return this.request<any>('/price-alerts', {
      method: 'POST',
      body: data,
    });
  }

  async getPriceAlerts() {
    return this.request<any[]>('/price-alerts', {
      cache: 'no-store',
    });
  }

  async deletePriceAlert(id: string) {
    return this.request<any>(`/price-alerts/${id}`, {
      method: 'DELETE',
    });
  }

  // RFQ
  async createRFQ(data: {
    cropType: string;
    quantity: number;
    unit: string;
    location: string;
    state: string;
    deliveryDate?: string;
    qualityRequirements?: string;
  }) {
    return this.request<any>('/rfq', {
      method: 'POST',
      body: data,
    });
  }

  async getRFQs(page: number = 1, pageSize: number = 10) {
    const params = new URLSearchParams({
      page: String(page),
      pageSize: String(pageSize),
    });

    return this.request<SearchResponse<any>>(`/rfq?${params}`, {
      cache: 'no-store',
    });
  }

  async getRFQById(id: string) {
    return this.request<any>(`/rfq/${id}`, {
      cache: 'no-store',
    });
  }

  async acceptQuote(rfqId: string, quoteId: string) {
    return this.request<any>(`/rfq/${rfqId}/quotes/${quoteId}/accept`, {
      method: 'POST',
    });
  }

  // Supply Forecast
  async getSupplyForecast(cropType: string, region?: string) {
    const params = new URLSearchParams({
      cropType,
      ...(region && { region }),
    });

    return this.request<any>(`/forecast/supply?${params}`, {
      cache: 'force-cache',
      next: { revalidate: 3600 }, // 1 hour
    });
  }

  // Price History
  async getPriceHistory(cropType: string, days: number = 30) {
    const params = new URLSearchParams({
      cropType,
      days: String(days),
    });

    return this.request<any[]>(`/price-history?${params}`, {
      cache: 'force-cache',
      next: { revalidate: 3600 },
    });
  }

  // Trust Score
  async getTrustScore(userId: string) {
    return this.request<any>(`/users/${userId}/trust-score`, {
      cache: 'force-cache',
      next: { revalidate: 1800 }, // 30 min
    });
  }

  // User
  async getCurrentUser() {
    return this.request<any>('/auth/me', {
      cache: 'no-store',
    });
  }

  async updateProfile(data: any) {
    return this.request<any>('/auth/profile', {
      method: 'PUT',
      body: data,
    });
  }

  // Subscriptions
  async createSubscription(data: {
    cropType: string;
    quantity: number;
    unit: string;
    frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
    deliveryAddress: any;
  }) {
    return this.request<any>('/subscriptions', {
      method: 'POST',
      body: data,
    });
  }

  async getSubscriptions() {
    return this.request<any[]>('/subscriptions', {
      cache: 'no-store',
    });
  }

  async updateSubscription(id: string, data: any) {
    return this.request<any>(`/subscriptions/${id}`, {
      method: 'PUT',
      body: data,
    });
  }

  async cancelSubscription(id: string) {
    return this.request<any>(`/subscriptions/${id}`, {
      method: 'DELETE',
    });
  }
}

export const apiClient = new APIClient();
