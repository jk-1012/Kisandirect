export const ACCOUNT_DELETION = 'ACCOUNT_DELETION';
export async function executeAccountDeletion(server, jobData) {
    const userId = jobData.userId;
    await server.db.query('BEGIN');
    try {
        await server.db.query(`UPDATE public.users SET
        phone = 'DELETED_' || id::text,
        profile_photo_url = NULL,
        geo_lat = NULL,
        geo_lng = NULL,
        kisan_id = NULL,
        updated_at = NOW()
       WHERE id = $1`, [userId]);
        await server.db.query(`UPDATE vault.farmer_kyc SET
        aadhaar_encrypted = pgcrypto.gen_random_bytes(32),
        pan_encrypted = pgcrypto.gen_random_bytes(32),
        bank_account_token = NULL,
        bank_ifsc = NULL,
        bank_verified = FALSE,
        penny_drop_ref = NULL,
        kyc_completed_at = NULL
       WHERE farmer_id = $1`, [userId]);
        await server.db.query('UPDATE public.farmer_profiles SET village = NULL WHERE user_id = $1', [userId]);
        await server.db.query(`INSERT INTO public.consent_records (user_id, consent_type, consented, policy_version, consented_at)
       VALUES ($1, 'ACCOUNT_DELETED', FALSE, 'N/A', NOW())`, [userId]);
        await server.db.query('DELETE FROM public.notifications WHERE user_id = $1', [userId]);
        await server.db.query('UPDATE public.listings SET farmer_id = NULL WHERE farmer_id = $1', [userId]);
        await server.db.query('COMMIT');
        return { ok: true, userId };
    }
    catch (error) {
        await server.db.query('ROLLBACK');
        throw error;
    }
}
