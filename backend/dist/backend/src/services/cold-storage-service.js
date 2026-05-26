import { createNotificationService } from './notification-service.js';
import { generateBookingId } from '../utils/ids.js';
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
export function createColdStorageService(server) {
    async function searchColdStoragesNearby(lat, lng, radiusKm = 50, capacityNeededMt, cropType) {
        const radiusMeters = Math.min(Math.max(radiusKm, 1), 200) * 1000;
        const values = [lng, lat, radiusMeters];
        let filters = 'verified = TRUE AND ST_DWithin(ST_MakePoint($1,$2)::geography, ST_MakePoint(geo_lng, geo_lat)::geography, $3)';
        if (capacityNeededMt != null) {
            values.push(capacityNeededMt);
            filters += ` AND available_capacity_mt >= $${values.length}`;
        }
        if (cropType) {
            values.push(cropType);
            filters += ` AND ($${values.length} = ANY(suitable_crops) OR suitable_crops IS NULL)`;
        }
        const result = await server.db.query(`SELECT id, nabard_id, name, operator_user_id, address, state_code, district, geo_lat, geo_lng,
              total_capacity_mt, available_capacity_mt, price_per_mt_per_week_paise, temperature_range_min,
              temperature_range_max, suitable_crops, verified, last_synced_at,
              ST_Distance(ST_MakePoint($1,$2)::geography, ST_MakePoint(geo_lng, geo_lat)::geography) AS distance_m
       FROM public.cold_storage_facilities
       WHERE ${filters}
       ORDER BY distance_m ASC
       LIMIT 50`, values);
        return result.rows.map((row) => {
            const availableRatio = Number(row.total_capacity_mt) > 0 ? Number(row.available_capacity_mt) / Number(row.total_capacity_mt) : 0;
            return {
                facility_id: row.id,
                nabard_id: row.nabard_id,
                name: row.name,
                operator_user_id: row.operator_user_id,
                address: row.address,
                state_code: row.state_code,
                district: row.district,
                geo_lat: row.geo_lat,
                geo_lng: row.geo_lng,
                total_capacity_mt: Number(row.total_capacity_mt),
                available_capacity_mt: Number(row.available_capacity_mt),
                price_per_mt_per_week_paise: row.price_per_mt_per_week_paise,
                price_per_mt_per_week_inr: row.price_per_mt_per_week_paise / 100,
                temperature_range_min: row.temperature_range_min,
                temperature_range_max: row.temperature_range_max,
                suitable_crops: row.suitable_crops,
                verified: row.verified,
                last_synced_at: row.last_synced_at,
                distance_km: Math.round((Number(row.distance_m) / 1000) * 10) / 10,
                availability_status: availableRatio > 0.2 ? 'AVAILABLE' : availableRatio > 0 ? 'LIMITED' : 'FULL'
            };
        });
    }
    async function getFacilityAvailability(facilityId, fromDate, toDate) {
        const start = new Date(fromDate);
        const end = new Date(toDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end < start) {
            throw server.httpErrors.badRequest('Invalid availability date range');
        }
        const facilityRes = await server.db.query(`SELECT id, nabard_id, name, state_code, district, geo_lat, geo_lng, total_capacity_mt, available_capacity_mt
       FROM public.cold_storage_facilities
       WHERE id = $1`, [facilityId]);
        const facility = facilityRes.rows[0];
        if (!facility) {
            throw server.httpErrors.notFound('Cold storage facility not found');
        }
        const bookingsRes = await server.db.query(`SELECT booking_ref, farmer_id, entry_date, exit_date, quantity_mt, crop_type, temperature_agreed_min,
              temperature_agreed_max, price_per_mt_per_week_paise, total_weeks, total_amount_paise, status
       FROM public.cold_storage_bookings
       WHERE facility_id = $1
         AND status NOT IN ('CANCELLED', 'COMPLETED')
         AND (entry_date, exit_date) OVERLAPS ($2::date, $3::date)
       ORDER BY entry_date ASC`, [facility.id, fromDate, toDate]);
        return {
            facility_id: facilityId,
            nabard_id: facility.nabard_id,
            name: facility.name,
            state_code: facility.state_code,
            district: facility.district,
            geo_lat: facility.geo_lat,
            geo_lng: facility.geo_lng,
            total_capacity_mt: Number(facility.total_capacity_mt),
            available_capacity_mt: Number(facility.available_capacity_mt),
            from_date: fromDate,
            to_date: toDate,
            bookings: bookingsRes.rows.map((row) => ({
                booking_ref: row.booking_ref,
                farmer_id: row.farmer_id,
                entry_date: row.entry_date,
                exit_date: row.exit_date,
                quantity_mt: Number(row.quantity_mt),
                crop_type: row.crop_type,
                temperature_agreed_min: row.temperature_agreed_min,
                temperature_agreed_max: row.temperature_agreed_max,
                price_per_mt_per_week_paise: row.price_per_mt_per_week_paise,
                total_weeks: Number(row.total_weeks),
                total_amount_paise: row.total_amount_paise,
                status: row.status
            }))
        };
    }
    async function createBooking(farmerId, facilityId, entryDate, exitDate, quantityMt, cropType, temperatureAgreedMin, temperatureAgreedMax) {
        if (quantityMt <= 0) {
            throw server.httpErrors.badRequest('Quantity must be greater than 0');
        }
        const start = new Date(entryDate);
        const end = new Date(exitDate);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
            throw server.httpErrors.badRequest('Invalid booking dates');
        }
        await server.db.query('BEGIN');
        try {
            const facilityRes = await server.db.query(`SELECT id, name, total_capacity_mt, available_capacity_mt, price_per_mt_per_week_paise,
                temperature_range_min, temperature_range_max, operator_user_id
         FROM public.cold_storage_facilities
         WHERE id = $1
         FOR UPDATE`, [facilityId]);
            const facility = facilityRes.rows[0];
            if (!facility) {
                throw server.httpErrors.notFound('Cold storage facility not found');
            }
            const conflictRes = await server.db.query(`SELECT id FROM public.cold_storage_bookings
         WHERE facility_id = $1
           AND farmer_id = $2
           AND status NOT IN ('CANCELLED', 'COMPLETED')
           AND (entry_date, exit_date) OVERLAPS ($3::date, $4::date)
         LIMIT 1`, [facilityId, farmerId, entryDate, exitDate]);
            if (conflictRes.rowCount > 0) {
                throw server.httpErrors.conflict('You already have an overlapping booking for this facility');
            }
            const bookedRes = await server.db.query(`SELECT COALESCE(SUM(quantity_mt), 0)::numeric AS booked_mt
         FROM public.cold_storage_bookings
         WHERE facility_id = $1
           AND status NOT IN ('CANCELLED', 'COMPLETED')
           AND (entry_date, exit_date) OVERLAPS ($2::date, $3::date)`, [facilityId, entryDate, exitDate]);
            const bookedMt = Number(bookedRes.rows[0]?.booked_mt ?? 0);
            const availableMt = Number(facility.total_capacity_mt) - bookedMt;
            if (availableMt < quantityMt) {
                throw server.httpErrors.conflict('INSUFFICIENT_CAPACITY');
            }
            const totalWeeks = Number(((end.getTime() - start.getTime()) / WEEK_MS).toFixed(2));
            const totalAmountPaise = Math.round(facility.price_per_mt_per_week_paise * quantityMt * totalWeeks);
            const bookingRef = generateBookingId();
            const bookingRes = await server.db.query(`INSERT INTO public.cold_storage_bookings (
           booking_ref, facility_id, farmer_id, entry_date, exit_date, quantity_mt, crop_type,
           temperature_agreed_min, temperature_agreed_max, price_per_mt_per_week_paise,
           total_weeks, total_amount_paise)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING booking_ref, status, entry_date, exit_date, quantity_mt, crop_type,
                   temperature_agreed_min, temperature_agreed_max,
                   price_per_mt_per_week_paise, total_weeks, total_amount_paise, payment_status, created_at`, [
                bookingRef,
                facilityId,
                farmerId,
                entryDate,
                exitDate,
                quantityMt,
                cropType,
                temperatureAgreedMin ?? facility.temperature_range_min,
                temperatureAgreedMax ?? facility.temperature_range_max,
                facility.price_per_mt_per_week_paise,
                totalWeeks,
                totalAmountPaise
            ]);
            await server.db.query(`UPDATE public.cold_storage_facilities
         SET available_capacity_mt = GREATEST(0, COALESCE(available_capacity_mt, total_capacity_mt) - $1)
         WHERE id = $2`, [quantityMt, facilityId]);
            await server.db.query('COMMIT');
            const notificationService = createNotificationService(server);
            const message = `Cold storage booking ${bookingRef} confirmed for ${quantityMt} MT of ${cropType} from ${entryDate} to ${exitDate}. Total ₹${(totalAmountPaise / 100).toFixed(2)}.`;
            await notificationService.createNotification({
                userId: farmerId,
                type: 'COLD_STORAGE_BOOKING_CONFIRMED',
                title: 'Cold storage booking confirmed',
                body: message,
                data: {
                    booking_ref: bookingRef,
                    facility_id: facilityId,
                    quantity_mt: quantityMt,
                    crop_type: cropType,
                    entry_date: entryDate,
                    exit_date: exitDate,
                    total_amount_paise: totalAmountPaise
                }
            });
            if (facility.operator_user_id) {
                await notificationService.createNotification({
                    userId: facility.operator_user_id,
                    type: 'COLD_STORAGE_BOOKING_RECEIVED',
                    title: 'New cold storage booking',
                    body: `Booking ${bookingRef} has been created for your facility ${facility.name}.`,
                    data: {
                        booking_ref: bookingRef,
                        facility_id: facilityId,
                        farmer_id: farmerId,
                        entry_date: entryDate,
                        exit_date: exitDate,
                        quantity_mt: quantityMt,
                        crop_type: cropType
                    }
                });
            }
            return {
                booking_ref: bookingRes.rows[0].booking_ref,
                status: bookingRes.rows[0].status,
                entry_date: bookingRes.rows[0].entry_date,
                exit_date: bookingRes.rows[0].exit_date,
                quantity_mt: Number(bookingRes.rows[0].quantity_mt),
                crop_type: bookingRes.rows[0].crop_type,
                temperature_agreed_min: bookingRes.rows[0].temperature_agreed_min,
                temperature_agreed_max: bookingRes.rows[0].temperature_agreed_max,
                price_per_mt_per_week_paise: bookingRes.rows[0].price_per_mt_per_week_paise,
                total_weeks: Number(bookingRes.rows[0].total_weeks),
                total_amount_paise: bookingRes.rows[0].total_amount_paise,
                total_amount_inr: bookingRes.rows[0].total_amount_paise / 100,
                payment_status: bookingRes.rows[0].payment_status,
                created_at: bookingRes.rows[0].created_at
            };
        }
        catch (err) {
            await server.db.query('ROLLBACK');
            throw err;
        }
    }
    async function getUserBookings(farmerId) {
        const result = await server.db.query(`SELECT b.booking_ref, b.status, b.entry_date, b.exit_date, b.quantity_mt, b.crop_type,
              b.temperature_agreed_min, b.temperature_agreed_max, b.price_per_mt_per_week_paise,
              b.total_weeks, b.total_amount_paise, b.payment_status, b.created_at,
              f.nabard_id AS facility_nabard_id, f.name AS facility_name, f.address AS facility_address,
              f.state_code, f.district
       FROM public.cold_storage_bookings b
       JOIN public.cold_storage_facilities f ON f.id = b.facility_id
       WHERE b.farmer_id = $1
       ORDER BY b.created_at DESC`, [farmerId]);
        return result.rows.map((row) => ({
            booking_ref: row.booking_ref,
            status: row.status,
            entry_date: row.entry_date,
            exit_date: row.exit_date,
            quantity_mt: Number(row.quantity_mt),
            crop_type: row.crop_type,
            temperature_agreed_min: row.temperature_agreed_min,
            temperature_agreed_max: row.temperature_agreed_max,
            price_per_mt_per_week_paise: row.price_per_mt_per_week_paise,
            total_weeks: Number(row.total_weeks),
            total_amount_paise: row.total_amount_paise,
            total_amount_inr: row.total_amount_paise / 100,
            payment_status: row.payment_status,
            created_at: row.created_at,
            facility_nabard_id: row.facility_nabard_id,
            facility_name: row.facility_name,
            facility_address: row.facility_address,
            facility_state_code: row.state_code,
            facility_district: row.district
        }));
    }
    return {
        searchColdStoragesNearby,
        getFacilityAvailability,
        createBooking,
        getUserBookings
    };
}
