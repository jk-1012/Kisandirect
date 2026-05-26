import { FastifyInstance } from 'fastify';
import { z } from 'zod';

const ACCOUNT_DELETION = 'ACCOUNT_DELETION';

const consentSchema = z.object({
  consent_type: z.enum(['KYC', 'TRANSACTION', 'MARKETING']),
  consented: z.boolean()
});

export function createConsentService(server: FastifyInstance) {
  async function recordConsent(userId: string, consentType: 'KYC' | 'TRANSACTION' | 'MARKETING', consented: boolean, ipAddress: string) {
    const policyVersion = process.env.PRIVACY_POLICY_VERSION ?? '1.0';
    await server.db.query(
      `INSERT INTO public.consent_records (user_id, consent_type, consented, policy_version, ip_address, consented_at)
       VALUES ($1, $2, $3, $4, $5, NOW())
       ON CONFLICT (user_id, consent_type)
       DO UPDATE SET consented = $3, policy_version = $4, ip_address = $5, consented_at = NOW()`,
      [userId, consentType, consented, policyVersion, ipAddress]
    );
    return { success: true };
  }

  async function getDataExport(userId: string) {
    const [userRes, farmerProfileRes, listingsRes, ordersRes, notificationCountRes, consentRes] = await Promise.all([
      server.db.query(
        'SELECT id, phone, language, kyc_status, trust_score, created_at FROM public.users WHERE id = $1',
        [userId]
      ),
      server.db.query(
        'SELECT state_code, district, village, farm_size_acres, crop_specializations FROM public.farmer_profiles WHERE user_id = $1',
        [userId]
      ),
      server.db.query(
        'SELECT listing_id, crop_type, quantity_kg, asking_price_paise, status, created_at FROM public.listings WHERE farmer_id = $1',
        [userId]
      ),
      server.db.query(
        'SELECT order_id, payment_status, order_status, created_at FROM public.orders WHERE farmer_id = $1 OR buyer_id = $1',
        [userId]
      ),
      server.db.query('SELECT COUNT(*) AS count FROM public.notifications WHERE user_id = $1', [userId]),
      server.db.query('SELECT consent_type, consented, policy_version, consented_at FROM public.consent_records WHERE user_id = $1', [userId])
    ]);

    return {
      exported_at: new Date().toISOString(),
      note: 'Aadhaar and PAN data available via secure vault export. Contact support@kisandirect.in.',
      user: userRes.rows[0] ?? null,
      farmer_profile: farmerProfileRes.rows[0] || null,
      listings: listingsRes.rows,
      orders: ordersRes.rows,
      notification_count: Number(notificationCountRes.rows[0]?.count ?? 0),
      consent_records: consentRes.rows
    };
  }

  async function scheduleAccountDeletion(userId: string, ipAddress: string) {
    const referenceId = `DEL-${Date.now()}`;
    await server.queues.deletionQueue.add(
      ACCOUNT_DELETION,
      {
        userId,
        requested_at: new Date().toISOString(),
        deadline: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        ip_address: ipAddress,
        reference_id: referenceId
      },
      { jobId: referenceId, removeOnComplete: true, removeOnFail: false }
    );
    return {
      success: true,
      message: 'Account deletion scheduled. Your personal data will be removed within 30 days.',
      reference_id: referenceId
    };
  }

  async function withdrawMarketingConsent(userId: string, ipAddress: string) {
    return await recordConsent(userId, 'MARKETING', false, ipAddress);
  }

  return {
    recordConsent,
    getDataExport,
    scheduleAccountDeletion,
    withdrawMarketingConsent,
    consentSchema
  };
}
