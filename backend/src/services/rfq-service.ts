import { FastifyInstance } from 'fastify';
import crypto from 'crypto';

export function createRfqService(server: FastifyInstance) {
  async function generateRfqId() {
    const dateCode = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const digits = Math.floor(100000 + Math.random() * 900000).toString();
    return `RFQ-${dateCode}-${digits}`;
  }

  async function generateQuoteId() {
    return `RQ-${Math.floor(100000 + Math.random() * 900000)}`;
  }

  async function sendWhatsApp(phone: string, message: string) {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;
    if (!apiUrl || !token) return;
    try {
      await fetch(apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ to: `91${phone}`, message })
      });
    } catch (err) {
      server.log.error({ err, phone }, 'whatsapp send failed');
    }
  }

  async function createRfq(buyerId: string, payload: {
    crop_type: string;
    quantity_mt: number;
    price_ceiling_inr_per_kg: number;
    delivery_date: string;
    delivery_district: string;
    delivery_state_code: string;
    quality_requirements?: string;
  }) {
    // require institutional buyer flag
    const buyerRes = await server.db.query('SELECT id, is_institutional FROM public.users WHERE id = $1', [buyerId]);
    const buyer = buyerRes.rows[0];
    if (!buyer) throw server.httpErrors.notFound('Buyer not found');
    if (!buyer.is_institutional) throw server.httpErrors.forbidden('Only institutional buyers may create RFQs');

    const rfqId = await generateRfqId();
    const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

    const insert = await server.db.query(
      `INSERT INTO public.rfqs (rfq_id, buyer_id, crop_type, quantity_mt, price_ceiling_inr_per_kg, delivery_date, delivery_district, delivery_state_code, quality_requirements, expires_at, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW()) RETURNING id`,
      [rfqId, buyerId, payload.crop_type, payload.quantity_mt, payload.price_ceiling_inr_per_kg, payload.delivery_date, payload.delivery_district, payload.delivery_state_code, payload.quality_requirements ?? null, expiresAt]
    );
    const rfqRowId = insert.rows[0].id;

    // search ES for matching farmers
    const state = payload.delivery_state_code;
    const crop = payload.crop_type;
    const esClient: any = server.storage?.searchClient;
    let matchedFarmers: Array<{ id: string; phone?: string }> = [];
    if (esClient) {
      try {
        const q: any = {
          index: server.storage.listingIndexName,
          size: 100,
          _source: ['farmer_id'] ,
          body: {
            query: {
              bool: {
                must: [
                  { term: { crop_type: crop } },
                  { term: { state_code: state } }
                ]
              }
            }
          }
        };
        const res = await esClient.search(q);
        const hits = res.hits?.hits ?? [];
        const farmerIds = Array.from(new Set(hits.map((h: any) => h._source?.farmer_id).filter(Boolean))).slice(0, 100);
        if (farmerIds.length) {
          const rows = await server.db.query(`SELECT id, phone FROM public.users WHERE id = ANY($1::uuid[]) AND role = 'FARMER' AND kyc_status = 'VERIFIED'`, [farmerIds]);
          matchedFarmers = rows.rows.map((r: any) => ({ id: r.id, phone: r.phone }));
        }
      } catch (err) {
        server.log.warn({ err }, 'rfq es search failed');
      }
    }

    // Fallback - if no ES or empty, try DB by farmer_profiles
    if (matchedFarmers.length === 0) {
      const rows = await server.db.query(
        `SELECT u.id, u.phone FROM public.users u JOIN public.farmer_profiles fp ON fp.user_id = u.id WHERE fp.state_code = $1 AND u.role = 'FARMER' AND u.kyc_status = 'VERIFIED' LIMIT 100`,
        [payload.delivery_state_code]
      );
      matchedFarmers = rows.rows.map((r: any) => ({ id: r.id, phone: r.phone }));
    }

    // notify farmers
    const qtyKg = payload.quantity_mt * 1000;
    const price = payload.price_ceiling_inr_per_kg.toFixed(2);
    const date = payload.delivery_date;
    const msg = `Bulk order opportunity! Buyer wants ${qtyKg}kg ${crop} at up to ₹${price}/kg by ${date}. Tap to submit your quote: [Submit Quote]`;
    for (const f of matchedFarmers.slice(0, 100)) {
      if (f.phone) await sendWhatsApp(f.phone, msg);
    }

    return { rfq_id: rfqId, matched_farmers_count: matchedFarmers.length, expires_at: expiresAt };
  }

  async function submitQuote(farmerId: string, rfqId: string, payload: { quantity_kg: number; price_per_kg_inr: number; available_from_date: string; notes?: string }) {
    const rfqRes = await server.db.query('SELECT * FROM public.rfqs WHERE rfq_id = $1', [rfqId]);
    const rfq = rfqRes.rows[0];
    if (!rfq) throw server.httpErrors.notFound('RFQ not found');
    if (new Date(rfq.expires_at) < new Date()) throw server.httpErrors.badRequest('RFQ expired');

    // ensure farmer is valid
    const farmerRes = await server.db.query('SELECT id FROM public.users WHERE id = $1 AND role = $2', [farmerId, 'FARMER']);
    if (farmerRes.rows.length === 0) throw server.httpErrors.forbidden('Only farmers may submit quotes');

    const quoteId = await generateQuoteId();
    await server.db.query(
      `INSERT INTO public.rfq_quotes (quote_id, rfq_id, farmer_id, quantity_kg, price_per_kg_inr, available_from_date, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())`,
      [quoteId, rfq.id, farmerId, payload.quantity_kg, payload.price_per_kg_inr, payload.available_from_date, payload.notes ?? null]
    );

    // notify buyer
    try {
      const buyer = await server.db.query('SELECT phone FROM public.users WHERE id = $1', [rfq.buyer_id]);
      const buyerPhone = buyer.rows[0]?.phone;
      if (buyerPhone) await sendWhatsApp(buyerPhone, `New quote received for your RFQ ${rfq.rfq_id}.`);
    } catch (err) {
      server.log.warn({ err }, 'notify buyer failed');
    }

    return { quote_id: quoteId, rfq_id: rfq.rfq_id };
  }

  async function listQuotes(buyerId: string, rfqId: string, opts: { sort?: string; format?: string }) {
    const rfqRes = await server.db.query('SELECT * FROM public.rfqs WHERE rfq_id = $1', [rfqId]);
    const rfq = rfqRes.rows[0];
    if (!rfq) throw server.httpErrors.notFound('RFQ not found');
    if (String(rfq.buyer_id) !== String(buyerId)) throw server.httpErrors.forbidden('Not authorized');

    // join quotes with farmer info and farmer_profiles
    const rows = await server.db.query(
      `SELECT q.*, u.phone, u.kisan_id, fp.trust_score, fp.district, fp.geo_lat, fp.geo_lng
       FROM public.rfq_quotes q
       JOIN public.users u ON u.id = q.farmer_id
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = u.id
       WHERE q.rfq_id = $1`,
      [rfq.id]
    );

    const quotes = rows.rows.map((r: any) => {
      const total_value = Number(r.quantity_kg) * Number(r.price_per_kg_inr);
      // distance calculation placeholder: requires delivery lat/lng — set null
      const distance_km = null;
      return {
        quote_id: r.quote_id,
        farmer_kisan_id: r.kisan_id,
        trust_score: r.trust_score ?? null,
        district: r.district ?? null,
        quantity_kg: Number(r.quantity_kg),
        price_per_kg_inr: Number(r.price_per_kg_inr),
        total_value: total_value,
        distance_km
      };
    });

    const sort = opts.sort ?? 'price_asc';
    if (sort === 'price_asc') quotes.sort((a: any, b: any) => a.price_per_kg_inr - b.price_per_kg_inr);
    else if (sort === 'trust_score') quotes.sort((a: any, b: any) => (b.trust_score ?? 0) - (a.trust_score ?? 0));
    else if (sort === 'proximity') quotes.sort((a: any, b: any) => (a.distance_km ?? 1e9) - (b.distance_km ?? 1e9));

    if (opts.format === 'csv') {
      const header = ['quote_id', 'farmer_kisan_id', 'trust_score', 'district', 'quantity_kg', 'price_per_kg_inr', 'total_value', 'distance_km'];
      const lines = [header.join(',')].concat(quotes.map((q: any) => [q.quote_id, q.farmer_kisan_id, q.trust_score ?? '', q.district ?? '', q.quantity_kg, q.price_per_kg_inr.toFixed(2), q.total_value.toFixed(2), q.distance_km ?? ''].join(',')));
      return { csv: lines.join('\n') };
    }

    return { quotes };
  }

  async function getRfqById(rfqId: string) {
    const res = await server.db.query('SELECT rfq_id, buyer_id, crop_type, quantity_mt, price_ceiling_inr_per_kg, delivery_date, delivery_district, delivery_state_code, quality_requirements, expires_at, created_at FROM public.rfqs WHERE rfq_id = $1', [rfqId]);
    const rfq = res.rows[0];
    if (!rfq) throw server.httpErrors.notFound('RFQ not found');
    return rfq;
  }

  return { createRfq, submitQuote, listQuotes, getRfqById };
}

export type RfqService = ReturnType<typeof createRfqService>;
