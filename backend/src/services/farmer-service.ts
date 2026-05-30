import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { generateUniqueKisanId } from '../utils/kisanId.js';
import { CROP_TAXONOMY } from '../../../data/cropTaxonomy.ts';

const languageSchema = z.enum(['hi', 'kn', 'te', 'ta', 'mr', 'gu', 'bn', 'or', 'pa', 'ml', 'as', 'en']);

const registerSchema = z.object({
  language: languageSchema,
  state_code: z.string().length(2),
  district: z.string().min(2),
  geo_lat: z.number(),
  geo_lng: z.number()
});

const bankSchema = z.object({
  account_number: z.string().min(9).max(18),
  ifsc: z.string().regex(/^[A-Z]{4}0[A-Z0-9]{6}$/i)
});

const fpoPreviewSchema = z.object({
  fpo_registration_number: z.string().min(3)
});

const confirmSchema = z.object({
  job_id: z.string(),
  confirmed: z.boolean()
});

const stateCodes = new Set([
  'AN', 'AP', 'AR', 'AS', 'BR', 'CH', 'CT', 'DN', 'DD', 'DL', 'GA', 'GJ', 'HR', 'HP', 'JK', 'JH', 'KA', 'KL', 'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'UP', 'UT', 'WB'
]);
const cropTypes = new Set(Object.values(CROP_TAXONOMY).flatMap((category) => Object.keys(category)));

function base64UrlEncode(buffer: Buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function sha256Base64Url(value: string) {
  const digest = crypto.createHash('sha256').update(value).digest();
  return base64UrlEncode(digest);
}

function parseCsvLine(line: string) {
  const values: string[] = [];
  let current = '';
  let insideQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      insideQuotes = !insideQuotes;
      continue;
    }

    if (char === ',' && !insideQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsv(fileContent: string) {
  const lines = fileContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { headers: [], rows: [] };
  }

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().trim());
  const rows = lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = values[index] ?? '';
    });
    return row;
  });

  return { headers, rows };
}

function parseAadhaarXml(xmlString: string) {
  const uidMatch = xmlString.match(/uid="([0-9]+)"/);
  if (!uidMatch) {
    return null;
  }

  const nameMatch = xmlString.match(/name="([^"]+)"/);
  const dobMatch = xmlString.match(/dob="([^"]+)"/);
  const stateMatch = xmlString.match(/state="([^"]+)"/);

  return {
    aadhaarNumber: uidMatch[1],
    name: nameMatch?.[1] ?? null,
    dateOfBirth: dobMatch?.[1] ?? null,
    state: stateMatch?.[1] ?? null
  };
}

export function createFarmerService(server: FastifyInstance) {
  async function findUser(userId: string) {
    const result = await server.db.query('SELECT id, phone, role, kisan_id, kyc_status FROM public.users WHERE id = $1', [userId]);
    return result.rows[0] ?? null;
  }

  async function sendWhatsAppWelcome(phone: string, kisanId: string) {
    const apiUrl = process.env.WHATSAPP_API_URL;
    const token = process.env.WHATSAPP_API_TOKEN;

    if (!apiUrl || !token) {
      server.log.warn('WhatsApp configuration missing, welcome message not sent');
      return;
    }

    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        to: `91${phone}`,
        message: `Welcome to KisanDirect! Your KisanID is ${kisanId}. Your account is now active.`
      })
    });
  }

  return {
    async registerFarmer(userId: string, payload: z.infer<typeof registerSchema>) {
      const data = registerSchema.parse(payload);
      const user = await findUser(userId);
      if (!user || user.kyc_status !== 'PENDING_KYC') {
        throw server.httpErrors.badRequest('User must exist and have pending KYC status');
      }

      await server.db.query(
        'UPDATE public.users SET language = $1, role = $2, updated_at = NOW() WHERE id = $3',
        [data.language, 'FARMER', userId]
      );

      await server.db.query(
        `INSERT INTO public.farmer_profiles (user_id, state_code, district, geo_lat, geo_lng, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW())
         ON CONFLICT (user_id) DO UPDATE SET state_code = EXCLUDED.state_code, district = EXCLUDED.district, geo_lat = EXCLUDED.geo_lat, geo_lng = EXCLUDED.geo_lng`,
        [userId, data.state_code.toUpperCase(), data.district, data.geo_lat, data.geo_lng]
      );

      return { kisanId: user.kisan_id, status: 'PENDING_KYC', nextStep: 'kyc' };
    },

    async initiateDigiLockerKyc(userId: string) {
      const user = await findUser(userId);
      if (!user) {
        throw server.httpErrors.unauthorized('User not found');
      }

      const codeVerifier = crypto.randomBytes(64).toString('base64url');
      const codeChallenge = sha256Base64Url(codeVerifier);
      await server.queues.connection.set(`digilocker:${userId}`, codeVerifier, { EX: 600 });

      const clientId = process.env.DIGILOCKER_CLIENT_ID;
      const redirectUri = `${process.env.BASE_URL ?? 'http://localhost:4000'}/api/v1/farmers/kyc/callback`;
      if (!clientId) {
        throw server.httpErrors.internalServerError('DigiLocker configuration missing');
      }

      const redirectUrl = new URL('https://api.digitallocker.gov.in/public/oauth2/1/authorize');
      redirectUrl.searchParams.set('response_type', 'code');
      redirectUrl.searchParams.set('client_id', clientId);
      redirectUrl.searchParams.set('redirect_uri', redirectUri);
      redirectUrl.searchParams.set('state', userId);
      redirectUrl.searchParams.set('code_challenge', codeChallenge);
      redirectUrl.searchParams.set('code_challenge_method', 'S256');

      return { redirectUrl: redirectUrl.toString() };
    },

    async completeDigiLockerCallback(code: string, userId: string) {
      const codeVerifier = await server.queues.connection.get(`digilocker:${userId}`);
      if (!codeVerifier) {
        throw server.httpErrors.badRequest('DigiLocker verification expired');
      }

      const clientId = process.env.DIGILOCKER_CLIENT_ID;
      const clientSecret = process.env.DIGILOCKER_CLIENT_SECRET;
      const redirectUri = `${process.env.BASE_URL ?? 'http://localhost:4000'}/api/v1/farmers/kyc/callback`;
      if (!clientId || !clientSecret) {
        throw server.httpErrors.internalServerError('DigiLocker configuration missing');
      }

      const tokenEndpoint = 'https://api.digitallocker.gov.in/public/oauth2/1/token';
      const tokenResponse = await fetch(tokenEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          client_id: clientId,
          redirect_uri: redirectUri,
          code_verifier: codeVerifier
        })
      });

      if (!tokenResponse.ok) {
        server.log.error({ status: tokenResponse.status }, 'DigiLocker token exchange failed');
        throw server.httpErrors.serviceUnavailable('DigiLocker service unavailable');
      }

      const tokenJson = (await tokenResponse.json()) as Record<string, unknown>;
      const accessToken = typeof tokenJson.access_token === 'string' ? tokenJson.access_token : null;
      if (!accessToken) {
        return { status: 'MANUAL_UPLOAD_REQUIRED' };
      }

      const headers = { Authorization: `Bearer ${accessToken}` };
      const aadhaarResponse = await fetch('https://api.digitallocker.gov.in/public/oauth2/1/xml/eaadhaar', { headers });
      if (!aadhaarResponse.ok) {
        if (aadhaarResponse.status === 404) {
          return { status: 'MANUAL_UPLOAD_REQUIRED' };
        }
        server.log.error({ status: aadhaarResponse.status }, 'DigiLocker Aadhaar fetch failed');
        throw server.httpErrors.serviceUnavailable('DigiLocker document fetch failed');
      }

      const aadhaarXml = await aadhaarResponse.text();
      const aadhaarData = parseAadhaarXml(aadhaarXml);
      if (!aadhaarData) {
        return { status: 'MANUAL_UPLOAD_REQUIRED' };
      }

      const panResponse = await fetch('https://api.digitallocker.gov.in/public/oauth2/1/xml/PANCR', { headers });
      const panXml = panResponse.ok ? await panResponse.text() : null;
      const panMatch = panXml?.match(/PAN="([A-Z0-9]+)"/i);
      const panNumber = panMatch?.[1] ?? null;

      const encryptionKey = process.env.PGCRYPTO_KEY;
      if (!encryptionKey) {
        throw server.httpErrors.internalServerError('PGCRYPTO_KEY is required');
      }

      const profileResult = await server.db.query('SELECT state_code FROM public.farmer_profiles WHERE user_id = $1', [userId]);
      const profile = profileResult.rows[0];
      if (!profile) {
        throw server.httpErrors.badRequest('Farmer profile required before KYC');
      }

      await server.db.query(
        `INSERT INTO vault.farmer_kyc (farmer_id, aadhaar_encrypted, pan_encrypted, digilocker_ref, created_at)
         VALUES ($1, encrypt($2, $3, 'aes'), encrypt($4, $3, 'aes'), $5, NOW())
         ON CONFLICT (farmer_id) DO UPDATE SET aadhaar_encrypted = encrypt($2, $3, 'aes'), pan_encrypted = encrypt($4, $3, 'aes'), digilocker_ref = $5, kyc_completed_at = NOW()`,
        [userId, aadhaarData.aadhaarNumber, encryptionKey, panNumber ?? '', code]
      );

      const kisanId = await generateUniqueKisanId(server, profile.state_code);
      await server.db.query(
        'UPDATE public.users SET kyc_status = $1, kisan_id = $2, updated_at = NOW() WHERE id = $3',
        ['ACTIVE', kisanId, userId]
      );

      const user = await findUser(userId);
      if (user) {
        await sendWhatsAppWelcome(user.phone, kisanId);
      }

      return { kisanId, status: 'ACTIVE' };
    },

    async addBankAccount(userId: string, payload: z.infer<typeof bankSchema>) {
      const data = bankSchema.parse(payload);
      const user = await findUser(userId);
      if (!user) {
        throw server.httpErrors.unauthorized('User not found');
      }

      const razorpayId = process.env.RAZORPAY_KEY_ID;
      const razorpaySecret = process.env.RAZORPAY_KEY_SECRET;
      if (!razorpayId || !razorpaySecret) {
        throw server.httpErrors.internalServerError('Razorpay configuration missing');
      }

      const fundResponse = await fetch('https://api.razorpay.com/v1/fund_accounts', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${razorpayId}:${razorpaySecret}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          contact_id: user.id,
          account_type: 'bank_account',
          bank_account: { name: user.phone, ifsc: data.ifsc, account_number: data.account_number }
        })
      });

      if (!fundResponse.ok) {
        server.log.error({ status: fundResponse.status }, 'Razorpay fund account creation failed');
        throw server.httpErrors.serviceUnavailable('Bank account creation failed');
      }

      const fundJson = (await fundResponse.json()) as Record<string, unknown>;
      const fundAccountId = typeof fundJson.id === 'string' ? fundJson.id : null;
      if (!fundAccountId) {
        server.log.error({ status: fundResponse.status, body: fundJson }, 'Razorpay fund account returned invalid ID');
        throw server.httpErrors.serviceUnavailable('Bank account creation failed');
      }

      const payoutResponse = await fetch('https://api.razorpay.com/v1/payouts', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${Buffer.from(`${razorpayId}:${razorpaySecret}`).toString('base64')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          account_number: fundAccountId,
          amount: 100,
          currency: 'INR',
          mode: 'IMPS',
          purpose: 'penny_drop'
        })
      });

      if (!payoutResponse.ok) {
        server.log.error({ status: payoutResponse.status }, 'Razorpay penny-drop failed');
        throw server.httpErrors.serviceUnavailable('Bank account verification failed');
      }

      const payoutJson = (await payoutResponse.json()) as Record<string, unknown>;
      const pennyDropRef = typeof payoutJson.id === 'string' ? payoutJson.id : null;

      await server.db.query(
        `INSERT INTO vault.farmer_kyc (farmer_id, bank_account_token, bank_ifsc, bank_verified, penny_drop_ref, created_at)
         VALUES ($1, $2, $3, FALSE, $4, NOW())
         ON CONFLICT (farmer_id) DO UPDATE SET bank_account_token = $2, bank_ifsc = $3, bank_verified = FALSE, penny_drop_ref = $4`,
        [userId, fundAccountId, data.ifsc, pennyDropRef]
      );

      return { status: 'VERIFICATION_PENDING', message: 'Bank account verification in progress', kisanId: user.kisan_id };
    },

    async previewFpoBulkRegister(fpoRegistrationNumber: string, csvBuffer: Buffer) {
      fpoPreviewSchema.parse({ fpo_registration_number: fpoRegistrationNumber });

      const content = csvBuffer.toString('utf-8');
      const { rows } = parseCsv(content);
      if (rows.length > 500) {
        throw server.httpErrors.badRequest('CSV exceeds maximum of 500 rows');
      }

      const valid: Array<Record<string, string>> = [];
      const invalid: Array<{ row: number; errors: string[]; data: Record<string, string> }> = [];

      rows.forEach((row, index) => {
        const errors: string[] = [];
        if (!/^[6-9]\d{9}$/.test(row.mobile || '')) {
          errors.push('Invalid mobile');
        }
        if (!stateCodes.has((row.state || '').toUpperCase())) {
          errors.push('Invalid state code');
        }
        if (!cropTypes.has((row.crop_type || '').toUpperCase().trim())) {
          errors.push('Invalid crop type');
        }
        if (errors.length > 0) {
          invalid.push({ row: index + 2, errors, data: row });
        } else {
          valid.push({
            name: row.name,
            mobile: row.mobile,
            village: row.village,
            district: row.district,
            state: row.state.toUpperCase(),
            crop_type: row.crop_type.toLowerCase()
          });
        }
      });

      const jobId = crypto.randomBytes(16).toString('hex');
      await server.queues.connection.set(`fpo:preview:${jobId}`, JSON.stringify({ fpoRegistrationNumber, valid }), { EX: 600 });

      return { jobId, valid, invalid };
    },

    async confirmFpoBulkRegister(userId: string, jobId: string, confirmed: boolean) {
      confirmSchema.parse({ job_id: jobId, confirmed });
      if (!confirmed) {
        return { job_id: jobId, status: 'CANCELLED', farmer_count: 0 };
      }

      const previewDataRaw = await server.queues.connection.get(`fpo:preview:${jobId}`);
      if (!previewDataRaw) {
        throw server.httpErrors.notFound('Preview job not found');
      }

      const previewData = JSON.parse(previewDataRaw) as { valid: Array<Record<string, string>> };
      const job = await server.queues.bulkRegisterQueue.add('BULK_FARMER_REGISTER', { rows: previewData.valid }, { removeOnComplete: true, removeOnFail: false });

      return { job_id: job.id, status: 'PROCESSING', farmer_count: previewData.valid.length };
    },

    async getBulkRegisterStatus(jobId: string) {
      const job = await server.queues.bulkRegisterQueue.getJob(jobId);
      if (!job) {
        throw server.httpErrors.notFound('Job not found');
      }

      const state = await job.getState();
      const progress = job.progress as any;
      return {
        status: state,
        total: progress?.total ?? 0,
        processed: progress?.processed ?? 0,
        failed: progress?.failed ?? 0,
        failed_mobiles: progress?.failedMobiles ?? []
      };
    }
  };
}
