import { FastifyInstance } from 'fastify';
import puppeteer from 'puppeteer';

const TDS_THRESHOLD_PAISE = 10_000_000; // ₹1,00,000
const TDS_RATE = 0.02; // 2%
const TDS_RATE_NO_PAN = 0.20; // 20% if no PAN
const ALERT_THRESHOLD_RATIO = 0.8;

function parseFinancialYear(financialYear?: string) {
  const now = new Date();
  if (!financialYear) {
    const year = now.getMonth() + 1 >= 4 ? now.getFullYear() : now.getFullYear() - 1;
    financialYear = `${year}-${String(year + 1).slice(-2)}`;
  }

  const match = financialYear.match(/^(\d{4})-(\d{2,4})$/);
  if (!match) {
    throw new Error('Invalid financial year format. Use YYYY-YY or YYYY-YYYY');
  }

  const startYear = Number(match[1]);
  let endYear = Number(match[2]);
  if (match[2].length === 2) {
    endYear = Number(`${String(startYear).slice(0, 2)}${match[2]}`);
  }
  if (endYear <= startYear) {
    endYear = startYear + 1;
  }

  return {
    startDate: `${startYear}-04-01`,
    endDate: `${endYear}-04-01`
  };
}

function formatCurrencyInr(paise: number) {
  return `₹${(paise / 100).toFixed(2)}`;
}

function maskPan(pan: string | null) {
  if (!pan) return null;
  if (pan.length <= 6) {
    return `${pan.slice(0, 2)}${'*'.repeat(Math.max(0, pan.length - 4))}${pan.slice(-2)}`;
  }
  return `${pan.slice(0, 3)}${'*'.repeat(Math.max(0, pan.length - 6))}${pan.slice(-3)}`;
}

export function createTDSService(server: FastifyInstance) {
  async function calculateTDS(farmerId: string, payoutAmountPaise: number): Promise<{
    tds_paise: number;
    net_paise: number;
    tds_rate: number;
    cumulative_payout_after: number;
  }> {
    const farmerRes = await server.db.query('SELECT annual_payout_inr FROM public.farmer_profiles WHERE user_id = $1', [farmerId]);
    const kycRes = await server.db.query('SELECT pan_encrypted FROM vault.farmer_kyc WHERE farmer_id = $1', [farmerId]);

    const cumulativePaise = Math.round(Number(farmerRes.rows[0]?.annual_payout_inr ?? 0) * 100);
    const hasPAN = Boolean(kycRes.rows[0]?.pan_encrypted);
    const tdsRate = hasPAN ? TDS_RATE : TDS_RATE_NO_PAN;

    let tdsPaise = 0;
    const payoutAfter = cumulativePaise + payoutAmountPaise;

    if (cumulativePaise >= TDS_THRESHOLD_PAISE) {
      tdsPaise = Math.round(payoutAmountPaise * tdsRate);
    } else if (payoutAfter > TDS_THRESHOLD_PAISE) {
      const aboveThreshold = payoutAfter - TDS_THRESHOLD_PAISE;
      tdsPaise = Math.round(aboveThreshold * tdsRate);
    }

    return {
      tds_paise: tdsPaise,
      net_paise: payoutAmountPaise - tdsPaise,
      tds_rate: tdsRate,
      cumulative_payout_after: payoutAfter
    };
  }

  async function getFarmerWithKYC(farmerId: string) {
    const baseRes = await server.db.query(
      `SELECT u.id AS user_id, u.phone, u.kisan_id, u.kyc_status, fp.annual_payout_inr, fp.tds_deducted_inr,
              vk.bank_ifsc, vk.bank_verified, vk.penny_drop_ref, vk.pan_encrypted
       FROM public.users u
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = u.id
       LEFT JOIN vault.farmer_kyc vk ON vk.farmer_id = u.id
       WHERE u.id = $1`,
      [farmerId]
    );

    const row = baseRes.rows[0];
    if (!row) {
      throw server.httpErrors.notFound('Farmer not found');
    }

    let pan: string | null = null;
    const encryptionKey = process.env.PGCRYPTO_KEY;
    if (encryptionKey && row.pan_encrypted) {
      const panRes = await server.db.query(
        `SELECT convert_from(decrypt(pan_encrypted, $1, 'aes'), 'UTF8') AS pan
         FROM vault.farmer_kyc WHERE farmer_id = $2`,
        [encryptionKey, farmerId]
      );
      pan = panRes.rows[0]?.pan ?? null;
    }

    return {
      user_id: row.user_id,
      phone: row.phone,
      kisan_id: row.kisan_id,
      kyc_status: row.kyc_status,
      annual_payout_inr: Number(row.annual_payout_inr ?? 0),
      tds_deducted_inr: Number(row.tds_deducted_inr ?? 0),
      bank_ifsc: row.bank_ifsc,
      bank_verified: row.bank_verified,
      penny_drop_ref: row.penny_drop_ref,
      pan: pan,
      masked_pan: maskPan(pan)
    };
  }

  type TDSRecord = {
    order_id: string;
    order_date: string;
    gross_paise: number;
    tds_paise: number;
    net_paise: number;
    month: string;
  };

  async function getTDSDataForFY(farmerId: string, financialYear?: string) {
    const { startDate, endDate } = parseFinancialYear(financialYear);
    const res = await server.db.query(
      `SELECT o.order_id, o.created_at AS order_date,
              t.amount_paise AS payout_paise,
              COALESCE((t.metadata->>'tds_paise')::integer, 0) AS tds_paise,
              (t.amount_paise + COALESCE((t.metadata->>'tds_paise')::integer, 0)) AS gross_paise,
              to_char(t.created_at, 'YYYY-MM') AS month
       FROM public.orders o
       JOIN audit.transaction_ledger t ON t.order_id = o.id AND t.event_type = 'ESCROW_RELEASED'
       WHERE o.farmer_id = $1
         AND t.created_at >= $2
         AND t.created_at < $3
       ORDER BY t.created_at ASC`,
      [farmerId, startDate, endDate]
    );

    const records = res.rows.map((row: any): TDSRecord => ({
      order_id: row.order_id,
      order_date: row.order_date,
      gross_paise: Number(row.gross_paise),
      tds_paise: Number(row.tds_paise),
      net_paise: Number(row.payout_paise),
      month: row.month
    }));

    const totalGrossPaise = records.reduce((sum: number, item: TDSRecord) => sum + item.gross_paise, 0);
    const totalTdsPaise = records.reduce((sum: number, item: TDSRecord) => sum + item.tds_paise, 0);
    const totalNetPaise = records.reduce((sum: number, item: TDSRecord) => sum + item.net_paise, 0);
    const tdsByMonth = records.reduce((acc: Record<string, number>, item: TDSRecord) => {
      acc[item.month] = (acc[item.month] ?? 0) + item.tds_paise;
      return acc;
    }, {} as Record<string, number>);

    return {
      financial_year: financialYear ?? `${startDate.slice(0, 4)}-${String(Number(startDate.slice(0, 4)) + 1).slice(-2)}`,
      period_start: startDate,
      period_end: endDate,
      total_gross_paise: totalGrossPaise,
      total_tds_paise: totalTdsPaise,
      total_net_paise: totalNetPaise,
      tds_by_month: Object.entries(tdsByMonth).map(([month, paise]) => ({ month, tds_paise: paise })),
      records
    };
  }

  function buildForm16AHtml(farmer: any, tdsData: any, financialYear: string) {
    const summaryRows = tdsData.records
      .map((record: any) => `<tr><td>${record.order_id}</td><td>${new Date(record.order_date).toISOString().slice(0, 10)}</td><td>${formatCurrencyInr(record.gross_paise)}</td><td>${formatCurrencyInr(record.tds_paise)}</td><td>${formatCurrencyInr(record.net_paise)}</td></tr>`) 
      .join('');

    return `<!doctype html>
      <html>
      <head>
        <meta charset="utf-8" />
        <style>
          body { font-family: Arial, sans-serif; color: #222; margin: 24px; }
          h1, h2 { color: #0a5238; }
          table { width: 100%; border-collapse: collapse; margin-top: 16px; }
          th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
          th { background: #f5f5f5; }
          .summary { margin-top: 24px; }
          .summary p { margin: 4px 0; }
        </style>
      </head>
      <body>
        <h1>Form 16A</h1>
        <p><strong>Financial Year:</strong> ${financialYear}</p>
        <h2>Farmer Details</h2>
        <p><strong>Kisan ID:</strong> ${farmer.kisan_id ?? 'N/A'}</p>
        <p><strong>Phone:</strong> ${farmer.phone ?? 'N/A'}</p>
        <p><strong>PAN:</strong> ${farmer.pan ? farmer.pan : farmer.masked_pan ?? 'NOT AVAILABLE'}</p>
        <p><strong>KYC Status:</strong> ${farmer.kyc_status}</p>

        <div class="summary">
          <h2>TDS Summary</h2>
          <p><strong>Total Gross Payout:</strong> ${formatCurrencyInr(tdsData.total_gross_paise)}</p>
          <p><strong>Total TDS Deducted:</strong> ${formatCurrencyInr(tdsData.total_tds_paise)}</p>
          <p><strong>Total Net Payout:</strong> ${formatCurrencyInr(tdsData.total_net_paise)}</p>
        </div>

        <table>
          <thead>
            <tr><th>Order</th><th>Date</th><th>Gross Amount</th><th>TDS Deducted</th><th>Net Amount</th></tr>
          </thead>
          <tbody>${summaryRows || '<tr><td colspan="5">No payouts in this financial year</td></tr>'}</tbody>
        </table>
      </body>
      </html>`;
  }

  async function generatePdfBuffer(html: string) {
    const browser = await puppeteer.launch({ args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '18mm', bottom: '18mm', left: '18mm', right: '18mm' } });
    await browser.close();
    return pdf;
  }

  async function generateForm16A(farmerId: string, financialYear?: string) {
    const farmer = await getFarmerWithKYC(farmerId);
    const tdsData = await getTDSDataForFY(farmerId, financialYear);
    const fy = financialYear ?? tdsData.financial_year;
    const html = buildForm16AHtml(farmer, tdsData, fy);
    return await generatePdfBuffer(html);
  }

  async function getAdminSummary(financialYear?: string) {
    const { startDate, endDate } = parseFinancialYear(financialYear);
    const tdsByMonthRes = await server.db.query(
      `SELECT to_char(t.created_at, 'YYYY-MM') AS month,
              COALESCE(SUM((t.metadata->>'tds_paise')::integer), 0) AS tds_paise
       FROM audit.transaction_ledger t
       WHERE t.event_type = 'ESCROW_RELEASED'
         AND t.created_at >= $1
         AND t.created_at < $2
       GROUP BY 1
       ORDER BY 1`,
      [startDate, endDate]
    );

    const approachingRes = await server.db.query(
      `SELECT u.id, u.kisan_id, u.phone, fp.annual_payout_inr, fp.tds_deducted_inr,
              GREATEST(0, 100000 - COALESCE(fp.annual_payout_inr, 0)) AS remaining_inr
       FROM public.users u
       JOIN public.farmer_profiles fp ON fp.user_id = u.id
       WHERE u.role = 'FARMER'
         AND COALESCE(fp.annual_payout_inr, 0) >= $1
         AND COALESCE(fp.annual_payout_inr, 0) < $2
       ORDER BY fp.annual_payout_inr DESC`,
      [Math.round(TDS_THRESHOLD_PAISE / 100 * ALERT_THRESHOLD_RATIO), Math.round(TDS_THRESHOLD_PAISE / 100)]
    );

    const summary = {
      financial_year: financialYear ?? `${startDate.slice(0, 4)}-${String(Number(startDate.slice(0, 4)) + 1).slice(-2)}`,
      tds_by_month: tdsByMonthRes.rows.map((row: any) => ({ month: row.month, tds_paise: Number(row.tds_paise) })),
      approaching_threshold: approachingRes.rows.map((row: any) => ({
        farmer_id: row.id,
        kisan_id: row.kisan_id,
        phone: row.phone,
        annual_payout_inr: Number(row.annual_payout_inr ?? 0),
        tds_deducted_inr: Number(row.tds_deducted_inr ?? 0),
        remaining_inr: Number(row.remaining_inr ?? 0)
      }))
    };

    if (summary.approaching_threshold.length > 0) {
      await sendSlackAlert(summary.approaching_threshold, summary.financial_year);
    }

    return summary;
  }

  async function sendSlackAlert(farmers: Array<{ kisan_id: string; phone: string; annual_payout_inr: number; remaining_inr: number }>, financialYear: string) {
    const webhook = process.env.SLACK_WEBHOOK_URL;
    if (!webhook) {
      server.log.warn('TDS alert configured but SLACK_WEBHOOK_URL is missing');
      return;
    }

    const lines = farmers.map((farmer) => `• ${farmer.kisan_id ?? farmer.phone} — ₹${farmer.annual_payout_inr.toLocaleString()} paid, ₹${farmer.remaining_inr.toLocaleString()} remaining`).join('\n');
    const text = `TDS Alert: ${farmers.length} farmer(s) within 20% of the ₹1,00,000 threshold for FY ${financialYear}.\n${lines}`;

    try {
      await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text })
      });
    } catch (error) {
      server.log.error({ error }, 'Failed to send TDS threshold alert to Slack');
    }
  }

  return {
    calculateTDS,
    generateForm16A,
    getAdminSummary,
    getTDSDataForFY,
    getFarmerWithKYC
  };
}
