import { FastifyInstance } from 'fastify';

export function createTrustScoreService(server: FastifyInstance) {
  async function computeFarmerTrustScore(farmerId: string) {
    const result = await server.db.query(
      `SELECT u.kyc_status, u.profile_photo_url, u.role, fp.annual_payout_inr,
              COUNT(o.*) FILTER (WHERE o.order_status IN ('DELIVERED','RELEASED','DISPUTE_RESOLVED_FARMER')) AS completed_orders,
              COUNT(d.*) FILTER (WHERE d.status IN ('RESOLVED_BUYER_FAVOR','AUTO_CLOSED_FARMER')) AS disputes_lost,
              COUNT(d.*) FILTER (WHERE d.status IN ('RESOLVED_FARMER_FAVOR')) AS disputes_won
       FROM public.users u
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = u.id
       LEFT JOIN public.orders o ON o.farmer_id = u.id
       LEFT JOIN public.disputes d ON d.farmer_id = u.id
       WHERE u.id = $1
       GROUP BY u.kyc_status, u.profile_photo_url, u.role, fp.annual_payout_inr`,
      [farmerId]
    );

    const row = result.rows[0];
    if (!row) {
      return 0;
    }

    let score = 30;
    if (String(row.kyc_status).toUpperCase() === 'VERIFIED') score += 20;
    if (row.profile_photo_url) score += 10;
    if (Number(row.annual_payout_inr) >= 100000) score += 5;

    const completedOrders = Number(row.completed_orders ?? 0);
    score += Math.min(20, completedOrders * 2);

    const disputesLost = Number(row.disputes_lost ?? 0);
    const disputesWon = Number(row.disputes_won ?? 0);
    score += Math.max(-30, disputesWon * 10 - disputesLost * 20);

    score = Math.min(100, Math.max(0, score));

    await server.db.query('UPDATE public.users SET trust_score = $1, updated_at = NOW() WHERE id = $2', [score, farmerId]);

    return score;
  }

  async function recalculateFarmerTrustScore(farmerId: string) {
    return await computeFarmerTrustScore(farmerId);
  }

  async function recalculateAllFarmers() {
    const farmers = await server.db.query('SELECT id FROM public.users WHERE role = $1', ['FARMER']);
    for (const row of farmers.rows) {
      await computeFarmerTrustScore(row.id);
    }
  }

  return {
    recalculateFarmerTrustScore,
    recalculateAllFarmers
  };
}
