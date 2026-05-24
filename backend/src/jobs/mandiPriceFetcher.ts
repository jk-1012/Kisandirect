import { FastifyInstance } from 'fastify';

const AGMARKNET_BASE = process.env.AGMARKNET_API_URL ?? 'https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070';
const AGMARKNET_API_KEY = process.env.AGMARKNET_API_KEY;

const TARGET_COMMODITIES = [
  'Tomato', 'Onion', 'Potato', 'Brinjal', 'Okra', 'Cauliflower',
  'Cabbage', 'Capsicum', 'Carrot', 'Beans', 'Peas', 'Cucumber',
  'Mango', 'Banana', 'Watermelon', 'Grapes', 'Pomegranate',
  'Rice', 'Wheat', 'Maize', 'Jowar', 'Bajra',
  'Chana', 'Tur/Arhar Dal', 'Moong Dal',
  'Turmeric', 'Ginger', 'Garlic', 'Chilli', 'Coriander'
];

const TARGET_STATES = [
  'Karnataka', 'Maharashtra', 'Uttar Pradesh', 'Tamil Nadu',
  'Andhra Pradesh', 'Gujarat', 'West Bengal', 'Punjab'
];

const STATE_CODE_MAP: Record<string, string> = {
  'ANDHRA PRADESH': 'AP',
  'ARUNACHAL PRADESH': 'AR',
  'ASSAM': 'AS',
  'BIHAR': 'BR',
  'CHHATTISGARH': 'CG',
  'GOA': 'GA',
  'GUJARAT': 'GJ',
  'HARYANA': 'HR',
  'HIMACHAL PRADESH': 'HP',
  'JAMMU AND KASHMIR': 'JK',
  'JHARKHAND': 'JH',
  'KARNATAKA': 'KA',
  'KERALA': 'KL',
  'MADHYA PRADESH': 'MP',
  'MAHARASHTRA': 'MH',
  'MANIPUR': 'MN',
  'MEGHALAYA': 'ML',
  'MIZORAM': 'MZ',
  'NAGALAND': 'NL',
  'ODISHA': 'OD',
  'PUNJAB': 'PB',
  'RAJASTHAN': 'RJ',
  'SIKKIM': 'SK',
  'TAMIL NADU': 'TN',
  'TELANGANA': 'TG',
  'TRIPURA': 'TR',
  'UTTAR PRADESH': 'UP',
  'UTTARAKHAND': 'UT',
  'WEST BENGAL': 'WB'
};

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, backoff = [1000, 2000, 4000]) {
  let attempt = 0;
  let lastError: unknown;

  while (attempt < retries) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      const delay = backoff[Math.min(attempt, backoff.length - 1)];
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}

function normalizeCommodity(value: string) {
  return value.trim().toUpperCase().replace(/\s+/g, '_');
}

function getStateCode(state: string) {
  const normalized = state.trim().toUpperCase();
  return STATE_CODE_MAP[normalized] ?? normalized.slice(0, 2);
}

function parsePaise(value: unknown) {
  const numeric = Number(String(value ?? '0').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(numeric) ? Math.round(numeric * 100) : 0;
}

function toPhoneNumber(phone: string) {
  return phone.replace(/[^0-9]/g, '').replace(/^0+/, '');
}

async function alertOpsTeam(server: FastifyInstance, message: string) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) {
    server.log.warn({ message }, 'Ops alert fallback');
    return;
  }

  try {
    await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: message })
    });
  } catch (error) {
    server.log.error({ error, message }, 'Failed to send ops alert');
  }
}

export const INGEST_AGMARKNET_PRICES = 'INGEST_AGMARKNET_PRICES';

export async function runMandiPriceFetcher(server: FastifyInstance) {
  const today = new Date().toISOString().slice(0, 10);
  let fetchedCount = 0;
  let failedCount = 0;

  if (!AGMARKNET_API_KEY) {
    server.log.error('AGMARKNET_API_KEY is not configured');
    throw server.httpErrors.internalServerError('AgMarkNet API key missing');
  }

  for (const commodity of TARGET_COMMODITIES) {
    for (const state of TARGET_STATES) {
      try {
        const url = new URL(AGMARKNET_BASE);
        url.searchParams.set('api-key', AGMARKNET_API_KEY);
        url.searchParams.set('format', 'json');
        url.searchParams.set('filters[Commodity]', commodity);
        url.searchParams.set('filters[State]', state);
        url.searchParams.set('filters[Arrival_Date]', today);
        url.searchParams.set('limit', '100');

        const data = await withRetry<any>(() => fetch(url.toString()).then((r) => r.json()), 3, [1000, 2000, 4000]);
        const records: any[] = Array.isArray(data?.records) ? data.records : [];

        for (const record of records) {
          const commodityKey = normalizeCommodity(commodity);
          const stateCode = getStateCode(record.State ?? state);
          const district = String(record.District ?? '').trim();
          const mandiId = String(record.Market_Code ?? '').trim();
          const mandiName = String(record.Market ?? '').trim() || 'UNKNOWN';
          const priceDate = String(record.Arrival_Date ?? today).slice(0, 10);

          if (!district || !mandiId) {
            continue;
          }

          const modalPricePaise = parsePaise(record.Modal_Price);
          const minPricePaise = parsePaise(record.Min_Price);
          const maxPricePaise = parsePaise(record.Max_Price);

          await server.db.query(
            `INSERT INTO public.mandi_prices
             (commodity, mandi_id, mandi_name, state_code, district, price_date, modal_price_paise, min_price_paise, max_price_paise)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
             ON CONFLICT ON CONSTRAINT mandi_prices_unique_record DO NOTHING`,
            [commodityKey, mandiId, mandiName, stateCode, district, priceDate, modalPricePaise, minPricePaise, maxPricePaise]
          );

          const cacheKey = `mandi:price:${commodityKey}:${district}:${stateCode}`;
          const cacheValue = {
            modal_price_inr_per_kg: modalPricePaise / 100 / 100,
            min_price_inr_per_kg: minPricePaise / 100 / 100,
            max_price_inr_per_kg: maxPricePaise / 100 / 100,
            mandi_name: mandiName,
            date: priceDate,
            cached_at: new Date().toISOString()
          };

          await server.queues.connection.setEx(cacheKey, 4 * 60 * 60, JSON.stringify(cacheValue));
          fetchedCount += 1;
        }
      } catch (err) {
        failedCount += 1;
        server.log.error({ commodity, state, err }, 'AgMarkNet fetch failed');
      }
    }
  }

  const consecutiveFailKey = 'agmarknet:consecutive_failures';
  if (failedCount > TARGET_COMMODITIES.length * TARGET_STATES.length * 0.5) {
    const failures = await server.queues.connection.incr(consecutiveFailKey);
    await server.queues.connection.expire(consecutiveFailKey, 8 * 60 * 60);
    if (Number(failures) >= 2) {
      await alertOpsTeam(server, 'AgMarkNet API failed 2+ consecutive fetches. Price data is stale.');
    }
  } else {
    await server.queues.connection.del(consecutiveFailKey);
  }

  server.log.info({ fetchedCount, failedCount }, 'AgMarkNet fetch complete');
  return { fetchedCount, failedCount };
}
