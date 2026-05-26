export function createTrustScoreService(server) {
    async function updateTrustScore(farmerId) {
        const result = await server.db.query('SELECT calculate_farmer_trust_score($1) AS score', [farmerId]);
        const newScore = Number(result.rows[0]?.score ?? 0);
        await server.db.query('UPDATE public.users SET trust_score = $1, updated_at = NOW() WHERE id = $2', [newScore, farmerId]);
        await server.storage.searchClient.updateByQuery({
            index: server.storage.listingIndexName,
            body: {
                script: {
                    source: 'ctx._source.farmer_trust_score = params.score',
                    params: { score: newScore }
                },
                query: {
                    term: {
                        farmer_id: farmerId
                    }
                }
            }
        });
        return newScore;
    }
    async function recalculateFarmerTrustScore(farmerId) {
        return await updateTrustScore(farmerId);
    }
    async function recalculateAllFarmers() {
        const farmers = await server.db.query('SELECT id FROM public.users WHERE role = $1', ['FARMER']);
        for (const row of farmers.rows) {
            await updateTrustScore(row.id);
        }
    }
    return {
        updateTrustScore,
        recalculateFarmerTrustScore,
        recalculateAllFarmers
    };
}
