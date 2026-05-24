import { FastifyInstance } from 'fastify';
import { generateComplianceRequestId } from '../utils/ids.js';

export function createComplianceService(server: FastifyInstance) {
  async function createConsent(userId: string, consentType: string, consented: boolean, policyVersion: string, ipAddress: string | undefined) {
    const result = await server.db.query(
      `INSERT INTO public.consent_records (user_id, consent_type, consented, policy_version, consented_at, ip_address)
       VALUES ($1,$2,$3,$4,NOW(),$5)
       RETURNING id`,
      [userId, consentType, consented, policyVersion, ipAddress ?? null]
    );
    return { id: result.rows[0].id, consent_type: consentType, consented, policy_version: policyVersion };
  }

  async function listConsents(userId: string) {
    const result = await server.db.query(
      `SELECT consent_type, consented, policy_version, consented_at, ip_address
       FROM public.consent_records
       WHERE user_id = $1
       ORDER BY consented_at DESC`,
      [userId]
    );
    return result.rows;
  }

  async function submitDataAccessRequest(userId: string, note: string) {
    const requestId = generateComplianceRequestId();
    const requestData = { note, requestor: userId };
    await server.db.query(
      `INSERT INTO public.data_access_requests (request_id, user_id, request_type, status, requested_at, request_data)
       VALUES ($1,$2,'ACCESS','PENDING',NOW(),$3)`,
      [requestId, userId, requestData]
    );
    return { request_id: requestId, status: 'PENDING' };
  }

  async function fulfillDataAccessRequest(userId: string, requestId: string) {
    const requestRes = await server.db.query(
      `SELECT id, status FROM public.data_access_requests WHERE request_id = $1 AND user_id = $2`,
      [requestId, userId]
    );
    const requestRow = requestRes.rows[0];
    if (!requestRow) {
      throw server.httpErrors.notFound('Access request not found');
    }

    const userRes = await server.db.query('SELECT id, phone, role, language, kisan_id, profile_photo_url, kyc_status FROM public.users WHERE id = $1', [userId]);
    const user = userRes.rows[0];

    const profilesRes = await server.db.query('SELECT state_code, district, village, farm_size_acres, crop_specializations FROM public.farmer_profiles WHERE user_id = $1', [userId]);
    const profile = profilesRes.rows[0] ?? null;
    const ordersRes = await server.db.query('SELECT order_id, quantity_kg, subtotal_paise, order_status, payment_status, created_at FROM public.orders WHERE buyer_id = $1 OR farmer_id = $1 ORDER BY created_at DESC', [userId]);
    const disputesRes = await server.db.query('SELECT dispute_id, status, reason, resolution_outcome, created_at, resolved_at FROM public.disputes WHERE buyer_id = $1 OR farmer_id = $1 ORDER BY created_at DESC', [userId]);

    const responseData = { user, profile, orders: ordersRes.rows, disputes: disputesRes.rows };

    await server.db.query(
      `UPDATE public.data_access_requests SET status = 'COMPLETED', completed_at = NOW(), request_data = $2 WHERE request_id = $1`,
      [requestId, responseData]
    );

    return responseData;
  }

  async function submitDataErasureRequest(userId: string, note: string) {
    const requestId = generateComplianceRequestId();
    await server.db.query(
      `INSERT INTO public.data_erasure_requests (request_id, user_id, status, requested_at, note)
       VALUES ($1,$2,'PENDING',NOW(),$3)`,
      [requestId, userId, note]
    );
    return { request_id: requestId, status: 'PENDING' };
  }

  return {
    createConsent,
    listConsents,
    submitDataAccessRequest,
    fulfillDataAccessRequest,
    submitDataErasureRequest
  };
}
