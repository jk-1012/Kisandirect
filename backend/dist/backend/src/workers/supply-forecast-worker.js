/**
 * Supply Forecast Worker
 * Aggregates supply data and generates market forecasts
 */
export async function supplyForecastHandler(job, server) {
    const { cropType, region, forecastDays = 7 } = job.data;
    try {
        server.log.info({
            jobId: job.id,
            cropType,
            region,
            forecastDays,
        }, 'Starting supply forecast calculation');
        // Collect supply data from active listings
        const supplyQuery = `
      SELECT 
        COUNT(*) as active_listings,
        SUM(quantity) as total_quantity,
        AVG(unit_price) as avg_price,
        MIN(unit_price) as min_price,
        MAX(unit_price) as max_price,
        DATE_TRUNC('day', l.created_at) as date_bucket
      FROM listings l
      WHERE l.status = 'ACTIVE' 
        AND l.crop_type = $1
        ${region ? 'AND l.region = $2' : ''}
        AND l.created_at >= NOW() - INTERVAL '${forecastDays} days'
      GROUP BY DATE_TRUNC('day', l.created_at)
      ORDER BY date_bucket DESC
    `;
        const params = region ? [cropType, region] : [cropType];
        const supplyResult = await server.db.query(supplyQuery, params);
        if (!supplyResult.rows || supplyResult.rows.length === 0) {
            server.log.info({ jobId: job.id, cropType, region }, 'No supply data available for forecast');
            return {
                cropType,
                region,
                forecastDate: new Date().toISOString(),
                calculatedAt: new Date().toISOString(),
                status: 'INSUFFICIENT_DATA',
                dataPoints: 0,
            };
        }
        // Calculate forecast metrics
        const dataPoints = supplyResult.rows.length;
        const latestData = supplyResult.rows[0];
        // Simple trend analysis
        let supplyTrend = 'STABLE';
        if (dataPoints >= 2) {
            const oldest = supplyResult.rows[dataPoints - 1];
            const quantityChange = ((latestData.total_quantity - oldest.total_quantity) / oldest.total_quantity) * 100;
            if (quantityChange > 10) {
                supplyTrend = 'INCREASING';
            }
            else if (quantityChange < -10) {
                supplyTrend = 'DECREASING';
            }
        }
        // Store forecast in database
        const forecastResult = await server.db.query(`INSERT INTO supply_forecasts 
       (crop_type, region, forecast_date, supply_trend, avg_daily_volume, data_points, created_at)
       VALUES ($1, $2, NOW(), $3, $4, $5, NOW())
       RETURNING id, forecast_date`, [cropType, region || null, supplyTrend, latestData.total_quantity, dataPoints]);
        server.log.info({
            jobId: job.id,
            cropType,
            region,
            supplyTrend,
            dataPoints,
            avgDailyVolume: latestData.total_quantity,
        }, 'Supply forecast calculated successfully');
        return {
            cropType,
            region,
            forecastDate: new Date().toISOString(),
            calculatedAt: new Date().toISOString(),
            status: supplyTrend,
            dataPoints,
        };
    }
    catch (error) {
        server.log.error({
            jobId: job.id,
            cropType,
            region,
            error: error?.message,
            stack: error?.stack,
            attemptsMade: job.attemptsMade,
        }, 'Supply forecast generation failed');
        throw error;
    }
}
/**
 * Configuration for supply forecast worker
 */
export const supplyForecastWorkerConfig = {
    name: 'supply-forecast',
    defaultJobOptions: {
        attempts: 2,
        backoff: {
            type: 'fixed',
            delay: 30000,
        },
        removeOnComplete: {
            age: 259200, // Remove after 3 days
        },
        removeOnFail: false,
        timeout: 30000,
    },
    concurrency: 5,
    settings: {
        maxStalledCount: 2,
        maxStalledInterval: 60000,
        lockDuration: 30000,
    },
};
