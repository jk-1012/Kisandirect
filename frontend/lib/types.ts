/**
 * Buyer-facing types and interfaces
 */

export interface Listing {
  id: string;
  title: string;
  description: string;
  cropType: string;
  cropCategory: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  minOrderQuantity: number;
  maxOrderQuantity?: number;
  images: string[];
  status: 'ACTIVE' | 'SOLD' | 'ARCHIVED';
  sellerId: string;
  sellerName: string;
  sellerRating: number;
  sellerReviews: number;
  location: string;
  district: string;
  state: string;
  certifications?: string[];
  organic: boolean;
  gradeType?: string;
  harvestDate?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ListingFilter {
  cropType?: string;
  priceMin?: number;
  priceMax?: number;
  organic?: boolean;
  location?: string;
  state?: string;
  minRating?: number;
  sortBy?: 'PRICE_LOW' | 'PRICE_HIGH' | 'NEWEST' | 'RATING';
}

export interface CartItem {
  listingId: string;
  quantity: number;
  unitPrice: number;
  listing: Listing;
}

export interface Cart {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  lastUpdated: string;
}

export interface Address {
  id?: string;
  type: 'HOME' | 'WORK' | 'OTHER';
  name: string;
  phone: string;
  street: string;
  city: string;
  state: string;
  zipCode: string;
  landmark?: string;
  isDefault?: boolean;
}

export interface ShippingOption {
  id: string;
  name: string;
  estimatedDays: number;
  cost: number;
  description: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  buyerId: string;
  sellerId: string;
  sellerName: string;
  items: OrderItem[];
  status: OrderStatus;
  totalAmount: number;
  shippingCost: number;
  taxAmount: number;
  finalAmount: number;
  paymentMethod: 'RAZORPAY' | 'BANK_TRANSFER' | 'ESCROW';
  paymentStatus: 'PENDING' | 'COMPLETED' | 'FAILED';
  deliveryAddress: Address;
  shippingProvider?: string;
  trackingNumber?: string;
  estimatedDelivery?: string;
  deliveredAt?: string;
  deliveredProof?: DeliveryProof;
  dispute?: Dispute;
  createdAt: string;
  updatedAt: string;
}

export interface OrderItem {
  listingId: string;
  title: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

export type OrderStatus = 
  | 'PENDING_PAYMENT'
  | 'PAYMENT_FAILED'
  | 'CONFIRMED'
  | 'PROCESSING'
  | 'SHIPPED'
  | 'IN_TRANSIT'
  | 'DELIVERED'
  | 'CANCELLED'
  | 'RETURNED';

export interface DeliveryProof {
  id: string;
  photos: string[];
  signature?: string;
  verificationOTP: string;
  verifiedAt: string;
  verifiedBy: string;
}

export interface Dispute {
  id: string;
  orderId: string;
  buyerId: string;
  sellerId: string;
  reason: DisputeReason;
  description: string;
  status: DisputeStatus;
  evidence: DisputeEvidence[];
  escalationLevel: number;
  assignedAgent?: string;
  resolution?: string;
  createdAt: string;
  updatedAt: string;
}

export type DisputeReason = 
  | 'QUALITY_ISSUE'
  | 'WRONG_PRODUCT'
  | 'DAMAGED_DELIVERY'
  | 'NOT_RECEIVED'
  | 'OTHER';

export type DisputeStatus = 
  | 'INITIATED'
  | 'UNDER_REVIEW'
  | 'EVIDENCE_REQUESTED'
  | 'RESOLUTION_PROPOSED'
  | 'RESOLVED'
  | 'ESCALATED';

export interface DisputeEvidence {
  id: string;
  type: 'PHOTO' | 'VIDEO' | 'DOCUMENT' | 'TEXT';
  url?: string;
  text?: string;
  uploadedAt: string;
}

export interface Notification {
  id: string;
  userId: string;
  type: NotificationType;
  title: string;
  message: string;
  orderId?: string;
  data?: Record<string, any>;
  read: boolean;
  readAt?: string;
  createdAt: string;
}

export type NotificationType = 
  | 'ORDER_CONFIRMED'
  | 'ORDER_SHIPPED'
  | 'DELIVERY_PENDING'
  | 'DELIVERY_SUCCESSFUL'
  | 'PAYMENT_FAILED'
  | 'DISPUTE_INITIATED'
  | 'DISPUTE_RESOLVED'
  | 'PRICE_ALERT'
  | 'NEW_LISTING'
  | 'SELLER_MESSAGE';

export interface PriceAlert {
  id: string;
  userId: string;
  cropType: string;
  targetPrice: number;
  operator: 'ABOVE' | 'BELOW';
  status: 'ACTIVE' | 'TRIGGERED' | 'CANCELLED';
  market?: string;
  triggers?: PriceAlertTrigger[];
  createdAt: string;
}

export interface PriceAlertTrigger {
  id: string;
  currentPrice: number;
  triggeredAt: string;
}

export interface SupplyForecast {
  cropType: string;
  region?: string;
  supplyTrend: 'INCREASING' | 'DECREASING' | 'STABLE';
  avgDailyVolume: number;
  forecastDate: string;
}

export interface RFQ {
  id: string;
  buyerId: string;
  cropType: string;
  quantity: number;
  unit: string;
  preferredPrice?: number;
  location: string;
  state: string;
  deliveryDate?: string;
  qualityRequirements?: string;
  status: 'OPEN' | 'QUOTED' | 'CLOSED';
  quotes?: Quote[];
  createdAt: string;
  expiresAt: string;
}

export interface Quote {
  id: string;
  rfqId: string;
  sellerId: string;
  sellerName: string;
  pricePerUnit: number;
  availableQuantity: number;
  deliveryDate?: string;
  certifications?: string[];
  status: 'PENDING' | 'ACCEPTED' | 'REJECTED';
  createdAt: string;
}

export interface Subscription {
  id: string;
  userId: string;
  cropType: string;
  quantity: number;
  unit: string;
  frequency: 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY';
  deliveryAddress: Address;
  status: 'ACTIVE' | 'PAUSED' | 'CANCELLED';
  nextDelivery?: string;
  orders?: string[]; // Order IDs
  createdAt: string;
}

export interface TrustScore {
  userId: string;
  overallScore: number;
  paymentReliability: number;
  deliveryReliability: number;
  communication: number;
  reviews: number;
  disputes: {
    initiated: number;
    resolved: number;
    rate: number;
  };
  badges: TrustBadge[];
}

export type TrustBadge = 
  | 'VERIFIED_BUYER'
  | 'FAST_PAYER'
  | 'RELIABLE_BUYER'
  | 'MASTER_BUYER'
  | 'NEW_BUYER';

export interface PriceHistory {
  date: string;
  price: number;
  minPrice: number;
  maxPrice: number;
  avgPrice: number;
}

export interface SearchResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface User {
  id: string;
  phone: string;
  email?: string;
  name: string;
  role: 'BUYER' | 'FARMER' | 'ADMIN';
  language: string;
  kycStatus: string;
  addresses: Address[];
  trustScore?: TrustScore;
  createdAt: string;
  updatedAt: string;
}
