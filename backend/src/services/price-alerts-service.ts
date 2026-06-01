import { FastifyInstance } from 'fastify';

export function createPriceAlertService(server: FastifyInstance) {
  /**
   * Create or update a price alert for a farmer
   * Farmer receives WhatsApp notification when market price crosses threshold
   */
  async function createPriceAlert(farmerId: string, payload: {
    crop_type: string;
    state_code: string;
    threshold_price_per_kg_inr: number;
    direction: 'ABOVE' | 'BELOW';
  }) {
    // Validate farmer exists and is verified
    const farmerRes = await server.db.query(
      'SELECT id FROM public.users WHERE id = $1 AND role = $2 AND kyc_status = $3',
      [farmerId, 'FARMER', 'VERIFIED']
    );

    if (!farmerRes.rows[0]) {
      throw server.httpErrors.forbidden('Only verified farmers may create price alerts');
    }

    // Check for existing active alert (prevent duplicates)
    const existingRes = await server.db.query(
      `SELECT id FROM public.price_alerts
       WHERE farmer_id = $1 AND crop_type = $2 AND state_code = $3 AND direction = $4 AND active = TRUE`,
      [farmerId, payload.crop_type, payload.state_code, payload.direction]
    );

    if (existingRes.rows[0]) {
      throw server.httpErrors.conflict(
        `Active alert already exists for ${payload.crop_type} in ${payload.state_code} (${payload.direction})`
      );
    }

    // Create or update alert
    const result = await server.db.query(
      `INSERT INTO public.price_alerts
       (farmer_id, crop_type, state_code, threshold_price_per_kg_inr, direction, active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, TRUE, NOW(), NOW())
       ON CONFLICT (farmer_id, crop_type, state_code, direction)
       DO UPDATE SET active = TRUE, threshold_price_per_kg_inr = EXCLUDED.threshold_price_per_kg_inr, updated_at = NOW()
       RETURNING id`,
      [farmerId, payload.crop_type, payload.state_code, payload.threshold_price_per_kg_inr, payload.direction]
    );

    server.log.info(
      {
        farmer_id: farmerId,
        crop_type: payload.crop_type,
        direction: payload.direction,
        threshold: payload.threshold_price_per_kg_inr
      },
      'Price alert created'
    );

    return {
      crop_type: payload.crop_type,
      state_code: payload.state_code,
      threshold_price_per_kg_inr: payload.threshold_price_per_kg_inr,
      direction: payload.direction,
      status: 'ACTIVE'
    };
  }

  /**
   * Deactivate a price alert
   */
  async function deletePriceAlert(farmerId: string, alertId: string) {
    const result = await server.db.query(
      `UPDATE public.price_alerts
       SET active = FALSE, updated_at = NOW()
       WHERE id = $1 AND farmer_id = $2
       RETURNING crop_type, state_code, direction`,
      [alertId, farmerId]
    );

    if (!result.rows[0]) {
      throw server.httpErrors.notFound('Alert not found or not authorized');
    }

    const alert = result.rows[0];

    server.log.info(
      { farmer_id: farmerId, crop_type: alert.crop_type, direction: alert.direction },
      'Price alert deactivated'
    );

    return { success: true, message: 'Alert deactivated' };
  }

  /**
   * Get farmer's active alerts
   */
  async function getFarmerAlerts(farmerId: string) {
    const result = await server.db.query(
      `SELECT id, crop_type, state_code, threshold_price_per_kg_inr, direction, last_triggered_at, created_at
       FROM public.price_alerts
       WHERE farmer_id = $1 AND active = TRUE
       ORDER BY crop_type, state_code, direction`,
      [farmerId]
    );

    return {
      alerts: result.rows.map((r: any) => ({
        id: r.id,
        crop_type: r.crop_type,
        state_code: r.state_code,
        threshold_price_per_kg_inr: Number(r.threshold_price_per_kg_inr),
        direction: r.direction,
        last_triggered_at: r.last_triggered_at,
        created_at: r.created_at
      })),
      count: result.rows.length
    };
  }

  /**
   * Fetch latest market prices and trigger alerts
   * Called by job runner: runs hourly from AgMarkNet/Bhashini APIs
   */
  async function checkAndNotifyPriceAlerts() {
    // Get all active alerts
    const alertsRes = await server.db.query(
      `SELECT pa.*, u.phone, u.language FROM public.price_alerts pa
       JOIN public.users u ON u.id = pa.farmer_id
       WHERE pa.active = TRUE
       ORDER BY pa.crop_type, pa.state_code`,
      []
    );

    if (!alertsRes.rows[0]) {
      server.log.debug('No active price alerts to check');
      return { checked: 0, triggered: 0 };
    }

    // Group by crop_type, state_code for efficient API calls
    const alertsByKey = new Map<string, Array<any>>();
    for (const alert of alertsRes.rows) {
      const key = `${alert.crop_type}:${alert.state_code}`;
      if (!alertsByKey.has(key)) {
        alertsByKey.set(key, []);
      }
      alertsByKey.get(key)!.push(alert);
    }

    let triggered = 0;
    let errors = 0;

    // Fetch current prices and check alerts
    for (const [key, alerts] of alertsByKey) {
      const [cropType, stateCode] = key.split(':');

      try {
        // Fetch from AgMarkNet (mock for now - replace with actual API)
        const currentPrice = await fetchMarketPrice(cropType, stateCode);

        if (!currentPrice) {
          server.log.warn({ crop_type: cropType, state_code: stateCode }, 'Could not fetch current price');
          continue;
        }

        // Check each alert
        for (const alert of alerts) {
          const shouldTrigger = alert.direction === 'ABOVE'
            ? currentPrice >= alert.threshold_price_per_kg_inr
            : currentPrice <= alert.threshold_price_per_kg_inr;

          if (shouldTrigger) {
            try {
              await notifyFarmerOfPrice(
                alert.farmer_id,
                alert.phone,
                alert.language,
                cropType,
                stateCode,
                currentPrice,
                alert.direction
              );

              // Update last_triggered_at
              await server.db.query(
                'UPDATE public.price_alerts SET last_triggered_at = NOW() WHERE id = $1',
                [alert.id]
              );

              triggered += 1;
            } catch (err) {
              server.log.error({ err, alert_id: alert.id }, 'Failed to notify farmer of price');
              errors += 1;
            }
          }
        }
      } catch (err) {
        server.log.error({ err, crop_type: cropType, state_code: stateCode }, 'Failed to fetch market price');
        errors += 1;
      }
    }

    server.log.info(
      { checked: alertsRes.rows.length, triggered, errors },
      'Price alert check completed'
    );

    return { checked: alertsRes.rows.length, triggered, errors };
  }

  /**
   * Fetch current market price (from AgMarkNet API)
   * TODO: Integrate with actual AgMarkNet API endpoint
   */
  async function fetchMarketPrice(cropType: string, stateCode: string): Promise<number | null> {
    try {
      // Mock implementation - replace with actual AgMarkNet API
      const apiUrl = process.env.AGMARKNET_API_URL;
      if (!apiUrl) {
        server.log.warn('AGMARKNET_API_URL not configured, using mock prices');
        return null;
      }

      const response = await fetch(`${apiUrl}/prices`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${process.env.AGMARKNET_API_KEY}`,
          'Content-Type': 'application/json'
        }
      });

      if (!response.ok) {
        server.log.error({ status: response.status }, 'AgMarkNet API error');
        return null;
      }

      const data = (await response.json()) as any;
      const price = data.prices?.[cropType]?.[stateCode];

      return price ? parseFloat(price) : null;
    } catch (err) {
      server.log.error({ err }, 'Failed to fetch market price');
      return null;
    }
  }

  /**
   * Send WhatsApp notification to farmer about price
   */
  async function notifyFarmerOfPrice(
    farmerId: string,
    phone: string,
    language: string,
    cropType: string,
    stateCode: string,
    currentPrice: number,
    direction: string
  ) {
    const message = `Price Alert! ${cropType} in ${stateCode} is now ₹${currentPrice.toFixed(2)}/kg (${direction === 'ABOVE' ? 'above' : 'below'} your threshold). Check mandi prices on KisanDirect.`;

    // Create in-app notification record in notifications table
    try {
      const notifyRes = await server.db.query(
        `INSERT INTO public.notifications (user_id, type, title, body, data, channel, status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          farmerId,
          'PRICE_ALERT',
          `${cropType} price alert: ₹${currentPrice.toFixed(2)}/kg`,
          message,
          JSON.stringify({ crop_type: cropType, state_code: stateCode, price: currentPrice, direction }),
          'WHATSAPP',
          'PENDING'
        ]
      );

      const notificationId = notifyRes.rows[0]?.id;

      if (notificationId) {
        // Queue WhatsApp delivery via notification service
        await server.queues.notificationQueue.add(
          'DELIVER_NOTIFICATION',
          { notificationId },
          { attempts: 3, backoff: { type: 'exponential', delay: 5000 } }
        );
      }
    } catch (err) {
      server.log.error({ err, phone }, 'Failed to queue WhatsApp notification');
      throw err;
    }

    server.log.info({ phone, crop_type: cropType }, 'Price notification queued');
  }

  /**
   * Get market price history for a crop (for frontend charting)
   */
  async function getPriceHistory(cropType: string, stateCode: string, days: number = 30) {
    // This would typically query a time-series database like TimescaleDB
    // For now, return empty array - requires historical price ingestion job
    const result = await server.db.query(
      `SELECT date_trunc('day', price_date) as date, AVG(price_inr_per_kg) as avg_price, 
              MIN(price_inr_per_kg) as min_price, MAX(price_inr_per_kg) as max_price
       FROM public.mandi_prices
       WHERE crop_type = $1 AND state_code = $2 AND price_date > NOW() - INTERVAL '$3 days'
       GROUP BY date_trunc('day', price_date)
       ORDER BY date DESC`,
      [cropType, stateCode, days]
    );

    return {
      crop_type: cropType,
      state_code: stateCode,
      period_days: days,
      prices: result.rows.map((r: any) => ({
        date: r.date,
        avg_price_inr_per_kg: Number(r.avg_price),
        min_price_inr_per_kg: Number(r.min_price),
        max_price_inr_per_kg: Number(r.max_price)
      }))
    };
  }

  return {
    createPriceAlert,
    deletePriceAlert,
    getFarmerAlerts,
    checkAndNotifyPriceAlerts,
    fetchMarketPrice,
    notifyFarmerOfPrice,
    getPriceHistory
  };
}

export type PriceAlertService = ReturnType<typeof createPriceAlertService>;
