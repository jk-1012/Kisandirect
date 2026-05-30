import { FastifyInstance } from 'fastify';
import { CROP_TAXONOMY } from '../../../data/cropTaxonomy.ts';

export const INDEX_LISTING_TO_ES = 'INDEX_LISTING_TO_ES';

function getCropDisplayName(cropCategory: string, cropType: string) {
  const category = CROP_TAXONOMY[cropCategory as keyof typeof CROP_TAXONOMY];
  if (!category) return cropType;
  const crop = category[cropType as keyof typeof category] as any;
  return crop?.label?.en ?? cropType;
}

export async function indexListingJob(server: FastifyInstance, listingId: string) {
  const result = await server.db.query(
    `SELECT l.*, u.trust_score AS farmer_trust_score, u.kisan_id AS farmer_kisan_id,
            fp.state_code, fp.district
     FROM public.listings l
     JOIN public.users u ON l.farmer_id = u.id
     JOIN public.farmer_profiles fp ON l.farmer_id = fp.user_id
     WHERE l.listing_id = $1`,
    [listingId]
  );

  const listing = result.rows[0];
  if (!listing) {
    server.log.warn({ listingId }, 'listing not found for indexing');
    return null;
  }

  const hasPhoto = Array.isArray(listing.photo_urls) && listing.photo_urls.length > 0;
  const document = {
    listing_id: listing.listing_id,
    farmer_id: listing.farmer_id,
    farmer_kisan_id: listing.farmer_kisan_id,
    farmer_trust_score: listing.farmer_trust_score,
    crop_type: listing.crop_type,
    crop_type_display: getCropDisplayName(listing.crop_category, listing.crop_type),
    crop_category: listing.crop_category,
    quantity_kg: Number(listing.quantity_kg),
    quantity_remaining_kg: Number(listing.quantity_remaining_kg),
    asking_price_paise: listing.asking_price_paise,
    mandi_price_paise: listing.mandi_price_paise,
    harvest_date: listing.harvest_date,
    delivery_available: listing.delivery_available,
    organic: listing.organic,
    grade: listing.grade,
    status: listing.status,
    state_code: listing.state_code,
    district: listing.district,
    description: listing.description,
    location: listing.geo_lat ? { lat: Number(listing.geo_lat), lon: Number(listing.geo_lng) } : null,
    photo_urls: listing.photo_urls ?? [],
    has_photo: hasPhoto,
    expires_at: listing.expires_at,
    created_at: listing.created_at,
    view_count: listing.view_count
  };

  await server.storage.searchClient.index({
    index: server.storage.listingIndexName,
    id: listing.listing_id,
    body: document,
    refresh: 'wait_for'
  });

  return { indexed: true, listingId };
}
