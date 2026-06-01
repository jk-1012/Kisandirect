/**
 * Utility functions for buyer-side features
 */

/**
 * Format currency for display
 */
export function formatCurrency(amount: number, currency: string = 'INR'): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Format quantity with unit
 */
export function formatQuantity(quantity: number, unit: string): string {
  return `${quantity} ${unit}`;
}

/**
 * Format date for display
 */
export function formatDate(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(date));
}

/**
 * Format time for display
 */
export function formatTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Format date and time
 */
export function formatDateTime(date: string | Date): string {
  return new Intl.DateTimeFormat('en-IN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(date));
}

/**
 * Calculate price per unit
 */
export function calculatePricePerUnit(totalPrice: number, quantity: number): number {
  return quantity > 0 ? Math.round((totalPrice / quantity) * 100) / 100 : 0;
}

/**
 * Calculate total price
 */
export function calculateTotal(unitPrice: number, quantity: number): number {
  return unitPrice * quantity;
}

/**
 * Validate phone number (Indian format)
 */
export function isValidPhoneNumber(phone: string): boolean {
  return /^[6-9]\d{9}$/.test(phone.replace(/\D/g, ''));
}

/**
 * Validate email
 */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Validate postal code
 */
export function isValidPostalCode(code: string): boolean {
  return /^\d{6}$/.test(code);
}

/**
 * Format phone number for display
 */
export function formatPhoneNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  return phone;
}

/**
 * Truncate text with ellipsis
 */
export function truncateText(text: string, length: number): string {
  if (text.length <= length) return text;
  return text.slice(0, length) + '...';
}

/**
 * Get rating color
 */
export function getRatingColor(rating: number): string {
  if (rating >= 4.5) return 'text-green-600';
  if (rating >= 4) return 'text-blue-600';
  if (rating >= 3) return 'text-yellow-600';
  return 'text-red-600';
}

/**
 * Get order status color
 */
export function getOrderStatusColor(status: string): string {
  switch (status) {
    case 'CONFIRMED':
    case 'SHIPPED':
    case 'DELIVERED':
      return 'bg-green-100 text-green-800';
    case 'PROCESSING':
    case 'IN_TRANSIT':
      return 'bg-blue-100 text-blue-800';
    case 'PENDING_PAYMENT':
      return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED':
    case 'PAYMENT_FAILED':
      return 'bg-red-100 text-red-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

/**
 * Get order status label
 */
export function getOrderStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    PENDING_PAYMENT: 'Waiting for Payment',
    PAYMENT_FAILED: 'Payment Failed',
    CONFIRMED: 'Order Confirmed',
    PROCESSING: 'Processing',
    SHIPPED: 'Shipped',
    IN_TRANSIT: 'In Transit',
    DELIVERED: 'Delivered',
    CANCELLED: 'Cancelled',
    RETURNED: 'Returned',
  };
  return labels[status] || status;
}

/**
 * Get dispute status label
 */
export function getDisputeStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    INITIATED: 'Initiated',
    UNDER_REVIEW: 'Under Review',
    EVIDENCE_REQUESTED: 'Evidence Requested',
    RESOLUTION_PROPOSED: 'Resolution Proposed',
    RESOLVED: 'Resolved',
    ESCALATED: 'Escalated',
  };
  return labels[status] || status;
}

/**
 * Get notification type label
 */
export function getNotificationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    ORDER_CONFIRMED: 'Order Confirmed',
    ORDER_SHIPPED: 'Order Shipped',
    DELIVERY_PENDING: 'Delivery Pending',
    DELIVERY_SUCCESSFUL: 'Delivery Successful',
    PAYMENT_FAILED: 'Payment Failed',
    DISPUTE_INITIATED: 'Dispute Initiated',
    DISPUTE_RESOLVED: 'Dispute Resolved',
    PRICE_ALERT: 'Price Alert',
    NEW_LISTING: 'New Listing',
    SELLER_MESSAGE: 'Seller Message',
  };
  return labels[type] || type;
}

/**
 * Get delivery status label
 */
export function getDeliveryStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    NOT_STARTED: 'Not Started',
    CONFIRMED: 'Confirmed',
    IN_TRANSIT: 'In Transit',
    OUT_FOR_DELIVERY: 'Out for Delivery',
    DELIVERED: 'Delivered',
  };
  return labels[status] || status;
}

/**
 * Estimate delivery date
 */
export function estimateDeliveryDate(estimatedDays: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + estimatedDays);
  return date;
}

/**
 * Check if order can be returned
 */
export function canReturnOrder(orderDate: string): boolean {
  const orderTime = new Date(orderDate);
  const returnDeadline = new Date(orderTime);
  returnDeadline.setDate(returnDeadline.getDate() + 7); // 7 day return window
  return new Date() <= returnDeadline;
}

/**
 * Check if dispute can be raised
 */
export function canRaiseDispute(deliveredDate?: string): boolean {
  if (!deliveredDate) return false;
  const deliveryTime = new Date(deliveredDate);
  const disputeDeadline = new Date(deliveryTime);
  disputeDeadline.setDate(disputeDeadline.getDate() + 7); // 7 day dispute window
  return new Date() <= disputeDeadline;
}

/**
 * Get image URL with optimization
 */
export function getOptimizedImageUrl(url: string, width?: number, quality: number = 75): string {
  try {
    const urlObj = new URL(url);
    
    // If it's a CDN URL, add optimization params
    if (urlObj.hostname.includes('cloudfront') || urlObj.hostname.includes('s3')) {
      const params = new URLSearchParams();
      if (width) params.append('w', String(width));
      params.append('q', String(quality));
      params.append('fit', 'max');
      
      return `${url}?${params.toString()}`;
    }
  } catch {
    // Not a valid URL, return as is
  }
  
  return url;
}

/**
 * Calculate trust score badge
 */
export function getTrustBadges(score: number): string[] {
  const badges: string[] = [];
  
  if (score >= 90) badges.push('MASTER_BUYER');
  if (score >= 75) badges.push('RELIABLE_BUYER');
  if (score >= 60) badges.push('FAST_PAYER');
  if (score >= 0) badges.push('VERIFIED_BUYER');
  
  return badges;
}

/**
 * Format supply trend
 */
export function getSupplyTrendLabel(trend: string): string {
  const labels: Record<string, string> = {
    INCREASING: 'Supply Increasing',
    DECREASING: 'Supply Decreasing',
    STABLE: 'Supply Stable',
  };
  return labels[trend] || trend;
}

/**
 * Get supply trend color
 */
export function getSupplyTrendColor(trend: string): string {
  switch (trend) {
    case 'INCREASING':
      return 'text-red-600'; // More supply = lower prices
    case 'DECREASING':
      return 'text-green-600'; // Less supply = higher prices
    case 'STABLE':
      return 'text-blue-600';
    default:
      return 'text-gray-600';
  }
}

/**
 * Calculate price difference percentage
 */
export function getPriceDifference(currentPrice: number, previousPrice: number): number {
  if (previousPrice === 0) return 0;
  return Math.round(((currentPrice - previousPrice) / previousPrice) * 100 * 100) / 100;
}

/**
 * Check if price is on sale
 */
export function isOnSale(currentPrice: number, originalPrice: number): boolean {
  return currentPrice < originalPrice;
}

/**
 * Calculate discount percentage
 */
export function getDiscountPercentage(currentPrice: number, originalPrice: number): number {
  if (originalPrice === 0) return 0;
  return Math.round(((originalPrice - currentPrice) / originalPrice) * 100);
}

/**
 * Format subscription frequency
 */
export function getSubscriptionFrequencyLabel(frequency: string): string {
  const labels: Record<string, string> = {
    WEEKLY: 'Every Week',
    BIWEEKLY: 'Every 2 Weeks',
    MONTHLY: 'Every Month',
  };
  return labels[frequency] || frequency;
}

/**
 * Calculate next delivery date from subscription frequency
 */
export function getNextDeliveryDate(frequency: string): Date {
  const date = new Date();
  const days = {
    WEEKLY: 7,
    BIWEEKLY: 14,
    MONTHLY: 30,
  };
  
  const daysToAdd = days[frequency as keyof typeof days] || 7;
  date.setDate(date.getDate() + daysToAdd);
  return date;
}

/**
 * Debounce function for search
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number,
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout;
  
  return function executedFunction(...args: Parameters<T>) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

/**
 * Check if value is within range
 */
export function isInRange(value: number, min: number, max: number): boolean {
  return value >= min && value <= max;
}

/**
 * Get share link for listing
 */
export function getListingShareLink(listingId: string, baseUrl: string = 'https://kisandirect.com'): string {
  return `${baseUrl}/buy/listings/${listingId}`;
}

/**
 * Calculate order estimate
 */
export function calculateOrderEstimate(
  subtotal: number,
  shippingCost: number = 0,
  taxRate: number = 0.05,
): { subtotal: number; tax: number; shipping: number; total: number } {
  const tax = subtotal * taxRate;
  const total = subtotal + tax + shippingCost;
  
  return {
    subtotal,
    tax: Math.round(tax * 100) / 100,
    shipping: shippingCost,
    total: Math.round(total * 100) / 100,
  };
}
