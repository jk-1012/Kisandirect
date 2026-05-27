import { register, Counter, Histogram, Gauge } from 'prom-client';

// API business metrics
export const metrics = {
  // Orders
  ordersTotal: new Counter({
    name: 'kd_orders_total',
    help: 'Total orders placed',
    labelNames: ['status'],
  }),
  orderValuePaise: new Histogram({
    name: 'kd_order_value_paise',
    help: 'Order value distribution in paise',
    buckets: [50000, 100000, 500000, 1000000, 5000000], // ₹500, ₹1000, ₹5000, ₹10000, ₹50000
  }),

  // Listings
  activeListings: new Gauge({
    name: 'kd_active_listings_total',
    help: 'Current active listings',
    labelNames: ['crop_category'],
  }),

  // Payments
  escrowHeldPaise: new Gauge({
    name: 'kd_escrow_held_paise',
    help: 'Total value in escrow (paise)',
  }),
  payoutBatchPaise: new Counter({
    name: 'kd_payout_batch_paise_total',
    help: 'Total paise paid out to farmers',
  }),

  // Notifications
  notificationsSent: new Counter({
    name: 'kd_notifications_sent_total',
    help: 'Notifications sent',
    labelNames: ['channel', 'template'],
  }),
  whatsappDeliveryRate: new Gauge({
    name: 'kd_whatsapp_delivery_rate',
    help: 'WhatsApp delivery success rate (0-1)',
  }),

  // Request latency (built-in Fastify metrics)
  requestDuration: new Histogram({
    name: 'http_request_duration_seconds',
    help: 'HTTP request duration',
    labelNames: ['method', 'route', 'status'],
    buckets: [0.05, 0.1, 0.25, 0.5, 1, 2, 5],
  }),
};

// Metrics endpoint helper
export function registerMetricsRoute(app) {
  app.get('/metrics', async (req, res) => {
    res.header('Content-Type', register.contentType);
    return register.metrics();
  });
}

export default metrics;
