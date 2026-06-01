import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { createNotificationService } from './notification-service.js';
import { CROP_TAXONOMY } from '../../../data/cropTaxonomy.ts';

const priceAlertSchema = z.object({
  crop_type: z.string().transform((value) => value.toUpperCase().trim()).refine((value) => Object.values(CROP_TAXONOMY).flatMap((category) => Object.keys(category)).includes(value), 'Unsupported crop type'),
  state_code: z.string().length(2).transform((value) => value.toUpperCase()),
  threshold_price_per_kg_inr: z.number().positive(),
  direction: z.enum(['ABOVE', 'BELOW'])
});

type AgmarknetRow = {
  crop_type: string;
  mandi_name: string;
  district: string;
  state_code: string;
  price_inr_per_kg: number;
  price_date: string;
  source: string;
  metadata?: Record<string, unknown>;
};

function normalizeCropType(value: unknown) {
  if (!value) return '';
  return String(value).trim().toUpperCase();
}

function normalizeStateCode(value: unknown) {
  if (!value) return '';
  return String(value).trim().toUpperCase().slice(0, 2);
}

function parsePrice(value: unknown) {
  if (value === null || value === undefined) return 0;
  const numeric = Number(String(value).replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? numeric : 0;
}

function normalizeResponse(data: any): AgmarknetRow[] {
  const rows: any[] = Array.isArray(data.records)
    ? data.records
    : Array.isArray(data.data)
    ? data.data
    : Array.isArray(data)
    ? data
    : [];

  return rows
    .map((row: any) => {
      const cropType = normalizeCropType(row.crop_type ?? row.commodity ?? row.commodity_name ?? row.crop ?? row.commodityname);
      const stateCode = normalizeStateCode(row.state_code ?? row.state ?? row.state_code_short ?? row.stateName);
      const mandiName = String(row.mandi_name ?? row.market_name ?? row.market ?? row.mandi ?? 'STATE_AVERAGE').trim() || 'STATE_AVERAGE';
      const price = parsePrice(row.price_inr_per_kg ?? row.price ?? row.modal_price ?? row.avg_price ?? row.landing_price);
      const priceDate = String(row.price_date ?? row.date ?? row.market_date ?? new Date().toISOString().slice(0, 10));

      return {
        crop_type: cropType,
        mandi_name: mandiName,
        district: String(row.district ?? row.district_name ?? row.market_district ?? '').trim(),
        state_code: stateCode,
        price_inr_per_kg: price,
        price_date: priceDate,
        source: String(row.source ?? 'agmarknet'),
        metadata: row.metadata ?? null
      };
    })
    .filter((row) => row.crop_type && row.state_code && row.price_inr_per_kg > 0);
}

function getCropDisplayName(cropType: string) {
  const found = Object.values(CROP_TAXONOMY).flatMap((category) => Object.entries(category)).find(([, value]) => value.label?.en === cropType || value.label?.hi === cropType || value.label?.en?.toUpperCase() === cropType);
  return found ? found[1].label?.en ?? cropType : cropType;
}

export const INGEST_AGMARKNET_PRICES = 'INGEST_AGMARKNET_PRICES';

export function createMarketService(server: FastifyInstance) {
  const notificationService = createNotificationService(server);

  async function fetchAgmarknetPrices() {
    const apiUrl = process.env.AGMARKNET_API_URL;
    if (!apiUrl) {
      throw server.httpErrors.internalServerError('AgMarkNet API URL is not configured');
    }

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.AGMARKNET_API_KEY) {
      headers.Authorization = `Bearer ${process.env.AGMARKNET_API_KEY}`;
    }

    const response = await fetch(apiUrl, { headers });
    if (!response.ok) {
      server.log.error({ status: response.status }, 'Failed to fetch AgMarkNet pricing');
      throw server.httpErrors.badGateway('Unable to fetch mandi pricing');
    }

    const payload = await response.json();
    const rows = normalizeResponse(payload);
    return rows;
  }

  async function ingestAgmarknetPrices() {
    const rows = await fetchAgmarknetPrices();
    if (rows.length === 0) {
      return { imported: 0 };
    }

    try {
      for (const row of rows as AgmarknetRow[]) {
        await server.db.query(
          `INSERT INTO public.mandi_prices (crop_type, mandi_name, district, state_code, price_inr_per_kg, price_date, source, metadata)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
           ON CONFLICT (crop_type, state_code, mandi_name, price_date, source)
           DO UPDATE SET price_inr_per_kg = EXCLUDED.price_inr_per_kg, metadata = EXCLUDED.metadata, created_at = NOW()`,
          [row.crop_type, row.mandi_name, row.district || null, row.state_code, row.price_inr_per_kg, row.price_date, row.source, row.metadata ?? null]
        );
      }
    } catch (error) {
      server.log.error({ error }, 'Failed to ingest mandi prices');
      throw server.httpErrors.internalServerError('Mandi price ingestion failed');
    }

    const summary = await server.db.query(
      `WITH latest AS (
         SELECT crop_type, state_code, AVG(price_inr_per_kg) AS average_price
         FROM public.mandi_prices
         WHERE price_date = (
           SELECT MAX(price_date) FROM public.mandi_prices mp2 WHERE mp2.crop_type = public.mandi_prices.crop_type AND mp2.state_code = public.mandi_prices.state_code
         )
         GROUP BY crop_type, state_code
       )
       SELECT crop_type, state_code, average_price FROM latest`
    );

    for (const row of summary.rows) {
      const key = `mandi:price:${row.crop_type}:${row.state_code}`;
      await server.queues.connection.set(key, Math.round(Number(row.average_price) * 100).toString());
      await triggerPriceAlerts(row.crop_type, row.state_code, Math.round(Number(row.average_price) * 100));
    }

    return { imported: rows.length, markets: summary.rows.length };
  }

  async function triggerPriceAlerts(cropType: string, stateCode: string, currentPricePaise: number) {
    const alertsResult = await server.db.query(
      `SELECT a.id, a.farmer_id, a.direction, a.threshold_price_per_kg_inr, a.last_triggered_at, u.phone, u.language
       FROM public.price_alerts a
       JOIN public.users u ON a.farmer_id = u.id
       WHERE a.active = true AND a.crop_type = $1 AND a.state_code = $2
         AND ((a.direction = 'ABOVE' AND a.threshold_price_per_kg_inr * 100 <= $3)
              OR (a.direction = 'BELOW' AND a.threshold_price_per_kg_inr * 100 >= $3))`,
      [cropType, stateCode, currentPricePaise]
    );

    const now = new Date();
    let sent = 0;

    for (const alert of alertsResult.rows) {
      const lastTriggered = alert.last_triggered_at ? new Date(alert.last_triggered_at) : null;
      if (lastTriggered && now.getTime() - lastTriggered.getTime() < 24 * 60 * 60 * 1000) {
        continue;
      }

      const threshold = Number(alert.threshold_price_per_kg_inr).toFixed(2);
      const currentPrice = (currentPricePaise / 100).toFixed(2);
      const directionText = alert.direction === 'ABOVE' ? 'above' : 'below';
      const cropLabel = getCropDisplayName(cropType);
      const title = `${cropLabel} price alert`;
      const body = `Mandi price for ${cropLabel} in ${stateCode} is now ₹${currentPrice}/kg, which is ${directionText} your threshold of ₹${threshold}/kg.`;

      await notificationService.createNotification({
        userId: alert.farmer_id,
        type: 'PRICE_ALERT',
        title,
        body,
        data: { crop_type: cropType, state_code: stateCode, current_price_inr_per_kg: Number(currentPrice), threshold_inr_per_kg: Number(threshold), direction: alert.direction },
        template: 'price_alert_notification',
        templateParameters: [cropLabel, stateCode, currentPrice, threshold, directionText],
        channel: 'whatsapp',
        sendExternal: true
      });

      await server.db.query('UPDATE public.price_alerts SET last_triggered_at = NOW(), updated_at = NOW() WHERE id = $1', [alert.id]);
      sent += 1;
    }

    return sent;
  }

  async function createPriceAlert(userId: string, payload: unknown) {
    const validated = priceAlertSchema.parse(payload);

    const insert = await server.db.query(
      `INSERT INTO public.price_alerts (farmer_id, crop_type, state_code, direction, threshold_price_per_kg_inr, active, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,true,NOW(),NOW()) RETURNING id`,
      [userId, validated.crop_type, validated.state_code, validated.direction, validated.threshold_price_per_kg_inr]
    );

    return { alert_id: insert.rows[0].id };
  }

  async function listPriceAlerts(userId: string) {
    const result = await server.db.query(
      `SELECT id, crop_type, state_code, direction, threshold_price_per_kg_inr, active, last_triggered_at, created_at, updated_at
       FROM public.price_alerts WHERE farmer_id = $1 ORDER BY created_at DESC`,
      [userId]
    );
    return result.rows.map((alert: any) => ({
      ...alert,
      threshold_price_per_kg_inr: Number(alert.threshold_price_per_kg_inr)
    }));
  }

  async function deletePriceAlert(userId: string, alertId: string) {
    const result = await server.db.query('DELETE FROM public.price_alerts WHERE id = $1 AND farmer_id = $2 RETURNING id', [alertId, userId]);
    if (result.rows.length === 0) {
      throw server.httpErrors.notFound('Price alert not found');
    }
    return { deleted: true };
  }

  async function getMarketIntelligence(cropType: string, stateCode: string) {
    const crop = normalizeCropType(cropType);
    const state = normalizeStateCode(stateCode);

    const latestResult = await server.db.query(
      `SELECT price_inr_per_kg, price_date, mandi_name, district FROM public.mandi_prices
       WHERE crop_type = $1 AND state_code = $2
       ORDER BY price_date DESC, created_at DESC
       LIMIT 1`,
      [crop, state]
    );
    const latest = latestResult.rows[0] ?? null;
    if (!latest) {
      return { crop_type: crop, state_code: state, current_price_per_kg_inr: null, trend: [], average_7d: null, average_30d: null };
    }

    const weeklyResult = await server.db.query(
      `SELECT AVG(price_inr_per_kg) AS avg_price
       FROM public.mandi_prices
       WHERE crop_type = $1 AND state_code = $2 AND price_date >= CURRENT_DATE - INTERVAL '7 days'`,
      [crop, state]
    );
    const monthResult = await server.db.query(
      `SELECT AVG(price_inr_per_kg) AS avg_price
       FROM public.mandi_prices
       WHERE crop_type = $1 AND state_code = $2 AND price_date >= CURRENT_DATE - INTERVAL '30 days'`,
      [crop, state]
    );
    const trendResult = await server.db.query(
      `SELECT price_date, AVG(price_inr_per_kg) AS avg_price
       FROM public.mandi_prices
       WHERE crop_type = $1 AND state_code = $2 AND price_date >= CURRENT_DATE - INTERVAL '7 days'
       GROUP BY price_date
       ORDER BY price_date ASC`,
      [crop, state]
    );

    const trend = trendResult.rows.map((row: any) => ({ date: row.price_date?.toISOString().slice(0, 10) ?? null, average_price_per_kg_inr: Number(row.avg_price) }));
    const weeklyAvg = Number(weeklyResult.rows[0]?.avg_price ?? 0);
    const monthAvg = Number(monthResult.rows[0]?.avg_price ?? 0);

    return {
      crop_type: crop,
      state_code: state,
      current_price_per_kg_inr: Number(latest.price_inr_per_kg),
      latest_mandi_name: latest.mandi_name,
      latest_mandi_district: latest.district,
      price_date: latest.price_date?.toISOString?.().slice(0, 10) ?? latest.price_date,
      average_7d: weeklyAvg || null,
      average_30d: monthAvg || null,
      trend,
      warning:
        weeklyAvg > 0 && Number(latest.price_inr_per_kg) > weeklyAvg * 1.15
          ? 'Current mandi price is more than 15% above its 7-day average.'
          : undefined
    };
  }

  return {
    fetchAgmarknetPrices,
    ingestAgmarknetPrices,
    createPriceAlert,
    listPriceAlerts,
    deletePriceAlert,
    getMarketIntelligence
  };
}
