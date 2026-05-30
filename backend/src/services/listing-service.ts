import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import crypto from 'crypto';
import { PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { generateListingId } from '../utils/ids.js';
import { CROP_TAXONOMY, VISION_LABEL_MAP } from '../../../data/cropTaxonomy.ts';
import { INDEX_LISTING_TO_ES } from '../jobs/indexListingJob.js';
import { scheduleListingLifecycleJobs, removeListingLifecycleJobs } from '../jobs/listingLifecycle.js';

const allowedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const maxPhotoSizeBytes = 500 * 1024;
const validCropTypes = new Set(
  Object.values(CROP_TAXONOMY).flatMap((category) => Object.keys(category))
);
const validCropCategories = new Set(Object.keys(CROP_TAXONOMY));
const MAX_ACTIVE_LISTINGS = 20;
const MAX_HARVEST_FUTURE_MONTHS = 6;
const MAX_LISTING_PHOTO_KEYS = 5;
const EXPIRES_HOURS = 72;
const INDEXING_DELAY_MS = 1000;

const listingSchema = z.object({
  crop_type: z.string().min(1).transform((value) => value.toUpperCase().trim()).refine((value) => validCropTypes.has(value), 'Unsupported crop type'),
  crop_category: z.string().min(1).transform((value) => value.toUpperCase().trim()).refine((value) => validCropCategories.has(value), 'Unsupported crop category'),
  quantity_kg: z.coerce.number().positive(),
  asking_price_paise: z.coerce.number().int().positive(),
  harvest_date: z.coerce.date(),
  expires_at: z.coerce.date().refine((date) => date > new Date(), 'Expiry date must be in the future'),
  delivery_available: z.coerce.boolean().optional().default(false),
  organic: z.coerce.boolean().optional().default(false),
  grade: z.string().max(1).optional(),
  description: z.string().max(1000).optional(),
  mandi_price_paise: z.coerce.number().int().positive().optional(),
  job_ids: z.any().optional()
});

type ListingCreatePayload = {
  crop_type: string;
  crop_category: string;
  quantity_kg: number;
  asking_price_per_kg_inr: number;
  harvest_date: Date;
  delivery_available: boolean;
  organic?: boolean;
  description?: string;
  photo_s3_keys?: string[];
  geo_lat?: number;
  geo_lng?: number;
  justification?: string;
};

type ListingRelistPayload = {
  asking_price_per_kg_inr?: number;
  harvest_date?: Date;
  delivery_available?: boolean;
  organic?: boolean;
  description?: string;
  geo_lat?: number;
  geo_lng?: number;
};

const cropLabelMap = new Map<string, string>(
  Object.entries(VISION_LABEL_MAP).map(([label, cropType]) => [label.toLowerCase(), cropType])
);

const allowedUploadContentTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_UPLOAD_EXPIRY = 300;

function normalizeCropType(value: string) {
  return value.toLowerCase().trim();
}

function getListingBucketName() {
  return process.env.LISTINGS_PHOTO_BUCKET ?? `kisandirect-listings-${(process.env.NODE_ENV ?? 'dev').toLowerCase()}`;
}

function getFileExtension(filename: string, contentType: string) {
  const allowedExtensions: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp'
  };
  const extensionFromType = allowedExtensions[contentType];
  const extensionFromName = filename.split('.').pop()?.toLowerCase();
  if (extensionFromName && Object.values(allowedExtensions).includes(extensionFromName)) {
    return extensionFromName;
  }
  return extensionFromType ?? 'jpg';
}

function normalizeFilename(filename: string) {
  return filename.replace(/[^a-zA-Z0-9._-]/g, '_');
}

function encodeCursor(values: Array<string | number | boolean | null>) {
  return Buffer.from(JSON.stringify(values)).toString('base64');
}

function decodeCursor(cursor: string): Array<string | number | boolean | null> | null {
  try {
    return JSON.parse(Buffer.from(cursor, 'base64').toString('utf-8')) as Array<string | number | boolean | null>;
  } catch {
    return null;
  }
}

function getCropDisplayName(cropCategory: string, cropType: string) {
  const category = CROP_TAXONOMY[cropCategory as keyof typeof CROP_TAXONOMY];
  if (!category) {
    return cropType;
  }
  const crop = category[cropType as keyof typeof category] as any;
  return crop?.label?.en ?? cropType;
}

function findCropTypeFromLabel(label: string) {
  const normalized = normalizeCropType(label);
  if (cropLabelMap.has(normalized)) {
    return cropLabelMap.get(normalized) ?? null;
  }

  for (const [alias, cropType] of cropLabelMap.entries()) {
    if (normalized.includes(alias)) {
      return cropType;
    }
  }

  return null;
}

export function createListingService(server: FastifyInstance) {
  async function findUser(userId: string) {
    const result = await server.db.query('SELECT id, phone, role, kisan_id, kyc_status FROM public.users WHERE id = $1', [userId]);
    return result.rows[0] ?? null;
  }

  async function findFarmerProfile(userId: string) {
    const result = await server.db.query('SELECT * FROM public.farmer_profiles WHERE user_id = $1', [userId]);
    return result.rows[0] ?? null;
  }

  async function detectCropFromImage(imageBuffer: Buffer) {
    const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
    if (!apiKey) {
      return { aiDetectedCrop: null, aiConfidence: null };
    }

    const response = await fetch(
      `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requests: [
            {
              image: { content: imageBuffer.toString('base64') },
              features: [{ type: 'LABEL_DETECTION', maxResults: 10 }]
            }
          ]
        })
      }
    );

    if (!response.ok) {
      server.log.warn({ status: response.status }, 'Vision API label detection failed');
      return { aiDetectedCrop: null, aiConfidence: null };
    }

    const json = (await response.json()) as any;
    const annotations = json.responses?.[0]?.labelAnnotations as Array<{ description?: string; score?: number }> | undefined;
    if (!annotations || annotations.length === 0) {
      return { aiDetectedCrop: null, aiConfidence: null };
    }

    for (const annotation of annotations) {
      if (!annotation.description) continue;
      const detected = findCropTypeFromLabel(annotation.description);
      if (detected) {
        return { aiDetectedCrop: detected, aiConfidence: Math.round((annotation.score ?? 0) * 10000) / 100 };
      }
    }

    return { aiDetectedCrop: null, aiConfidence: null };
  }

  async function uploadPhoto(listingId: string, file: any) {
    const buffer = await file.toBuffer();
    if (buffer.length > maxPhotoSizeBytes) {
      throw server.httpErrors.badRequest('Photo must be smaller than 500KB');
    }

    if (!allowedMimeTypes.has(file.mimetype)) {
      throw server.httpErrors.unsupportedMediaType('Only JPEG, PNG, and WEBP images are supported');
    }

    const extension = file.filename?.split('.').pop() ?? 'jpg';
    const key = `listings/${listingId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${extension}`;
    const command = new PutObjectCommand({
      Bucket: server.storage.bucketName,
      Key: key,
      Body: buffer,
      ContentType: file.mimetype,
      ACL: 'public-read'
    });

    await server.storage.s3Client.send(command);

    if (server.storage.cloudfrontDomain) {
      return `https://${server.storage.cloudfrontDomain}/${key}`;
    }

    return `https://${server.storage.bucketName}.s3.${server.storage.region}.amazonaws.com/${key}`;
  }

  async function indexListing(listing: any) {
    const document = {
      listing_id: listing.listing_id,
      farmer_id: listing.farmer_id,
      crop_type: listing.crop_type,
      crop_category: listing.crop_category,
      asking_price_paise: listing.asking_price_paise,
      mandi_price_paise: listing.mandi_price_paise,
      quantity_kg: Number(listing.quantity_kg),
      quantity_remaining_kg: Number(listing.quantity_remaining_kg),
      harvest_date: listing.harvest_date,
      delivery_available: listing.delivery_available,
      organic: listing.organic,
      grade: listing.grade,
      description: listing.description,
      photo_urls: listing.photo_urls,
      status: listing.status,
      expires_at: listing.expires_at,
      ai_detected_crop: listing.ai_detected_crop,
      ai_confidence: Number(listing.ai_confidence) ?? null,
      geo_location: { lat: Number(listing.geo_lat), lon: Number(listing.geo_lng) }
    };

    await server.storage.searchClient.index({
      index: server.storage.listingIndexName,
      id: listing.id,
      body: document,
      refresh: 'wait_for'
    });
  }

  async function createListing(userId: string, payload: ListingCreatePayload) {
    const owner = await findUser(userId);
    if (!owner) {
      throw server.httpErrors.unauthorized('User not found');
    }
    if (owner.role !== 'FARMER' || owner.kyc_status !== 'ACTIVE') {
      throw server.httpErrors.forbidden('Only active farmers may create listings');
    }

    const profile = await findFarmerProfile(userId);
    if (!profile) {
      throw server.httpErrors.badRequest('Farmer profile is required');
    }

    const validated = z.object({
      crop_type: z.string().transform((value) => value.toUpperCase().trim()).refine((value) => validCropTypes.has(value), 'Unsupported crop type'),
      crop_category: z.string().transform((value) => value.toUpperCase().trim()).refine((value) => validCropCategories.has(value), 'Unsupported crop category'),
      quantity_kg: z.number().min(1).max(100000),
      asking_price_per_kg_inr: z.number().min(0.01),
      harvest_date: z.date().refine((date) => {
        const max = new Date();
        max.setMonth(max.getMonth() + MAX_HARVEST_FUTURE_MONTHS);
        return date <= max;
      }, `Harvest date must not be more than ${MAX_HARVEST_FUTURE_MONTHS} months in the future`),
      delivery_available: z.boolean(),
      organic: z.boolean().default(false),
      description: z.string().max(500).optional(),
      photo_s3_keys: z.array(z.string()).max(MAX_LISTING_PHOTO_KEYS).optional(),
      geo_lat: z.number().optional(),
      geo_lng: z.number().optional(),
      justification: z.string().max(500).optional()
    }).parse(payload);

    const activeCountResult = await server.db.query(
      "SELECT COUNT(*) FROM public.listings WHERE farmer_id = $1 AND status = 'ACTIVE'",
      [userId]
    );
    const activeCount = Number(activeCountResult.rows[0]?.count ?? 0);
    if (activeCount >= MAX_ACTIVE_LISTINGS) {
      throw server.httpErrors.badRequest('Maximum active listings reached');
    }

    const mandiKey = `mandi:price:${validated.crop_type}:${profile.state_code}`;
    const mandiPriceString = await server.queues.connection.get(mandiKey);
    const mandiPricePaise = mandiPriceString ? Number(mandiPriceString) : null;

    const askingPricePaise = Math.round(validated.asking_price_per_kg_inr * 100);
    const expiresAt = new Date(Date.now() + EXPIRES_HOURS * 60 * 60 * 1000);
    const listingId = await generateUniqueListingId();

    const jobIds: Record<string, string> = {};

    const insertResult = await server.db.query(
      `INSERT INTO public.listings
       (listing_id, farmer_id, crop_type, crop_category, quantity_kg, quantity_remaining_kg, asking_price_paise, mandi_price_paise, harvest_date,
        delivery_available, organic, grade, description, photo_urls, status, expires_at, geo_lat, geo_lng, ai_detected_crop, ai_confidence, job_ids)
       VALUES ($1,$2,$3,$4,$5,$5,$6,$7,$8,$9,$10,$11,$12,$13,'ACTIVE',$14,$15,$16,NULL,NULL,$17)
       RETURNING *`,
      [
        listingId,
        userId,
        validated.crop_type,
        validated.crop_category,
        validated.quantity_kg,
        askingPricePaise,
        mandiPricePaise,
        validated.harvest_date,
        validated.delivery_available,
        validated.organic,
        null,
        validated.description ?? null,
        validated.photo_s3_keys ?? [],
        expiresAt,
        validated.geo_lat ?? profile.geo_lat ?? null,
        validated.geo_lng ?? profile.geo_lng ?? null,
        jobIds
      ]
    );

    const listing = insertResult.rows[0];

    const lifecycleIds = await scheduleListingLifecycleJobs(server, listingId);
    const indexingJob = await server.queues.listingQueue.add(INDEX_LISTING_TO_ES, { listingId }, { delay: INDEXING_DELAY_MS, removeOnComplete: true, removeOnFail: false });
    const indexingJobId = indexingJob.id?.toString();

    if (!lifecycleIds.expiry_warning_24h_job_id || !lifecycleIds.expiry_warning_1h_job_id || !lifecycleIds.expire_job_id || !indexingJobId) {
      throw server.httpErrors.internalServerError('Failed to enqueue listing lifecycle jobs');
    }

    jobIds.expiry_warning_24h_job_id = lifecycleIds.expiry_warning_24h_job_id;
    jobIds.expiry_warning_1h_job_id = lifecycleIds.expiry_warning_1h_job_id;
    jobIds.expire_job_id = lifecycleIds.expire_job_id;
    jobIds.indexing_job_id = indexingJobId;

    await server.db.query('UPDATE public.listings SET job_ids = $1 WHERE id = $2', [jobIds, listing.id]);

    const mandiComparison = mandiPricePaise
      ? {
          mandi_price_per_kg: mandiPricePaise / 100,
          your_price_per_kg: askingPricePaise / 100,
          difference_percent: `${((askingPricePaise / mandiPricePaise - 1) * 100).toFixed(1).replace('-', '+-')}%`
        }
      : null;

    return {
      listing_id: listing.listing_id,
      share_url: `${process.env.FRONTEND_URL ?? 'https://kisandirect.in'}/listings/${listing.listing_id}`,
      status: listing.status,
      expires_at: listing.expires_at,
      mandi_comparison: mandiComparison,
      warning: mandiPricePaise && askingPricePaise > mandiPricePaise * 3 ? 'Asking price is more than 3x mandi price and may require justification' : undefined
    };
  }

  async function generateUniqueListingId() {
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const candidate = generateListingId();
      const result = await server.db.query('SELECT 1 FROM public.listings WHERE listing_id = $1 LIMIT 1', [candidate]);
      if (result.rows.length === 0) {
        return candidate;
      }
    }
    throw server.httpErrors.internalServerError('Unable to generate unique listing id');
  }

  async function getMyListings(userId: string) {
    const result = await server.db.query('SELECT * FROM public.listings WHERE farmer_id = $1 ORDER BY created_at DESC', [userId]);
    return result.rows;
  }

  async function getListingById(listingId: string) {
    const result = await server.db.query(
      `SELECT l.*, u.kisan_id, u.trust_score, fp.state_code, fp.district
       FROM public.listings l
       LEFT JOIN public.users u ON u.id = l.farmer_id
       LEFT JOIN public.farmer_profiles fp ON fp.user_id = l.farmer_id
       WHERE l.listing_id = $1`,
      [listingId]
    );
    const row = result.rows[0] ?? null;
    if (!row) {
      return null;
    }

    return {
      ...row,
      crop_type_display: getCropDisplayName(row.crop_category, row.crop_type),
      farmer: {
        kisan_id: row.kisan_id,
        trust_score: row.trust_score,
        district: row.district,
        state: row.state_code
      }
    };
  }

  async function cancelListing(userId: string, listingId: string) {
    const result = await server.db.query(
      `SELECT id, job_ids FROM public.listings WHERE listing_id = $1 AND farmer_id = $2 AND status = 'ACTIVE'`,
      [listingId, userId]
    );
    if (result.rows.length === 0) {
      throw server.httpErrors.notFound('Active listing not found for cancellation');
    }

    const listing = result.rows[0];
    if (listing.job_ids) {
      await removeListingLifecycleJobs(server, listing.job_ids as Record<string, string | undefined>);
    }

    await server.db.query(
      `UPDATE public.listings SET status = 'CANCELLED', updated_at = NOW() WHERE id = $1`,
      [listing.id]
    );

    try {
      await server.storage.searchClient.update({
        index: server.storage.listingIndexName,
        id: listingId,
        body: { doc: { status: 'CANCELLED' } },
        refresh: 'wait_for'
      });
    } catch (err: any) {
      server.log.warn({ err, listingId }, 'failed to update search index on cancel');
    }

    return { cancelled: true };
  }

  async function getPhotoUploadUrl(userId: string, filename: string, contentType: string) {
    if (!allowedUploadContentTypes.has(contentType)) {
      throw server.httpErrors.unsupportedMediaType('Only JPEG, PNG, and WEBP images are supported');
    }

    const bucketName = getListingBucketName();
    const extension = getFileExtension(filename, contentType);
    const key = `listings/uploads/${userId}/${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${extension}`;

    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: key,
      ContentType: contentType,
      ACL: 'private'
    });

    const uploadUrl = await getSignedUrl(server.storage.s3Client, command, { expiresIn: MAX_UPLOAD_EXPIRY });

    return {
      uploadUrl,
      s3Key: key,
      expiresIn: MAX_UPLOAD_EXPIRY
    };
  }

  async function processPhoto(userId: string, s3Key: string) {
    const bucketName = getListingBucketName();
    const job = await server.queues.photoProcessingQueue.add(
      'PROCESS_LISTING_PHOTO',
      { userId, s3Key, bucketName },
      { removeOnComplete: true, removeOnFail: false }
    );

    try {
      const result = await job.waitUntilFinished(server.queues.photoProcessingEvents, 10000);
      return result as any;
    } catch (error) {
      server.log.error({ error, jobId: job.id }, 'Photo processing job failed');
      throw server.httpErrors.internalServerError('Photo processing failed');
    }
  }

  type ListingSearchQuery = {
    q?: string;
    crop_type?: string;
    crop_category?: string;
    state?: string;
    district?: string;
    lat?: number;
    lng?: number;
    radius_km?: number;
    price_min?: number;
    price_max?: number;
    quantity_min?: number;
    harvest_date_from?: string;
    harvest_date_to?: string;
    organic?: boolean;    delivery_available?: boolean;    grade?: 'A' | 'B' | 'C';
    sort?: 'proximity' | 'recency' | 'price_asc' | 'price_desc' | 'trust_score';
    cursor?: string;
    limit?: number;
  };

  async function searchListings(query: ListingSearchQuery) {
    const size = query.limit && query.limit > 0 ? Math.min(query.limit, 50) : 20;
    const filters: any[] = [
      { term: { status: 'ACTIVE' } },
      { range: { expires_at: { gt: 'now' } } },
      { range: { quantity_remaining_kg: { gt: 0 } } }
    ];

    if (query.crop_type) {
      filters.push({ term: { crop_type: query.crop_type.toUpperCase() } });
    }
    if (query.crop_category) {
      filters.push({ term: { crop_category: query.crop_category.toUpperCase() } });
    }
    if (query.state) {
      filters.push({ term: { state_code: query.state.toUpperCase() } });
    }
    if (query.district) {
      const districts = String(query.district).split(',').map((d) => d.trim()).filter(Boolean);
      if (districts.length === 1) {
        filters.push({ term: { 'district.keyword': districts[0] } });
      } else if (districts.length > 1) {
        filters.push({ terms: { 'district.keyword': districts } });
      }
    }
    if (query.organic !== undefined) {
      filters.push({ term: { organic: query.organic } });
    }
    if (query.grade) {
      filters.push({ term: { grade: query.grade } });
    }
    if (query.delivery_available !== undefined) {
      filters.push({ term: { delivery_available: query.delivery_available } });
    }
    if (query.price_min !== undefined || query.price_max !== undefined) {
      const range: Record<string, any> = {};
      if (query.price_min !== undefined) range.gte = Math.round(query.price_min * 100);
      if (query.price_max !== undefined) range.lte = Math.round(query.price_max * 100);
      filters.push({ range: { asking_price_paise: range } });
    }
    if (query.quantity_min !== undefined) {
      filters.push({ range: { quantity_remaining_kg: { gte: query.quantity_min } } });
    }
    if (query.harvest_date_from || query.harvest_date_to) {
      const range: Record<string, any> = {};
      if (query.harvest_date_from) range.gte = query.harvest_date_from;
      if (query.harvest_date_to) range.lte = query.harvest_date_to;
      filters.push({ range: { harvest_date: range } });
    }
    if (query.lat !== undefined && query.lng !== undefined && query.radius_km !== undefined) {
      filters.push({
        geo_distance: {
          distance: `${query.radius_km}km`,
          location: { lat: query.lat, lon: query.lng }
        }
      });
    }

    const should: any[] = [];
    if (query.q) {
      should.push({
        multi_match: {
          query: query.q,
          fields: ['crop_type_display^4', 'description^2']
        }
      });
    }

    const boolQuery = {
      bool: {
        must: [],
        filter: filters,
        should,
        minimum_should_match: should.length > 0 ? 1 : 0
      }
    };

    const functionScore = {
      function_score: {
        query: boolQuery,
        functions: [
          {
            gauss: {
              created_at: {
                origin: 'now',
                scale: '7d',
                decay: 0.5
              }
            },
            weight: 0.7
          },
          {
            field_value_factor: {
              field: 'farmer_trust_score',
              factor: 0.03,
              missing: 0
            },
            weight: 0.3
          },
          {
            filter: { term: { has_photo: true } },
            weight: 0.2
          }
        ],
        score_mode: 'sum',
        boost_mode: 'sum'
      }
    };

    const sort: any[] = [];
    const cursorValues = query.cursor ? decodeCursor(query.cursor) : undefined;
    if (query.sort === 'proximity' && query.lat !== undefined && query.lng !== undefined) {
      sort.push({
        _geo_distance: {
          location: { lat: query.lat, lon: query.lng },
          order: 'asc',
          unit: 'km'
        }
      });
      sort.push({ _score: 'desc' }, { created_at: 'desc' }, { listing_id: 'asc' });
    } else if (query.sort === 'recency') {
      sort.push({ created_at: 'desc' }, { farmer_trust_score: 'desc' }, { listing_id: 'asc' });
    } else if (query.sort === 'price_asc') {
      sort.push({ asking_price_paise: 'asc' }, { created_at: 'desc' }, { listing_id: 'asc' });
    } else if (query.sort === 'price_desc') {
      sort.push({ asking_price_paise: 'desc' }, { created_at: 'desc' }, { listing_id: 'asc' });
    } else if (query.sort === 'trust_score') {
      sort.push({ farmer_trust_score: 'desc' }, { created_at: 'desc' }, { listing_id: 'asc' });
    } else {
      sort.push({ _score: 'desc' }, { created_at: 'desc' }, { listing_id: 'asc' });
    }

    const body: any = {
      query: functionScore,
      sort,
      size
    };

    if (cursorValues && Array.isArray(cursorValues)) {
      body.search_after = cursorValues;
    }

    const response = await server.storage.searchClient.search({
      index: server.storage.listingIndexName,
      body
    });

    const hits = response.body.hits.hits as Array<{ _id: string; _source: any; sort?: Array<any> }>;
    const results = hits.map((hit) => {
      const source = hit._source;
      const askingPrice = Number(source.asking_price_paise ?? 0) / 100;
      const mandiPrice = source.mandi_price_paise != null ? Number(source.mandi_price_paise) / 100 : null;
      const diff = mandiPrice ? ((askingPrice / mandiPrice - 1) * 100) : null;
      return {
        listing_id: source.listing_id,
        share_url: `${process.env.FRONTEND_URL ?? 'https://kisandirect.in'}/listings/${source.listing_id}`,
        crop: {
          type: source.crop_type,
          category: source.crop_category,
          display_name: source.crop_type_display ?? getCropDisplayName(source.crop_category, source.crop_type)
        },
        quantity_kg: Number(source.quantity_kg),
        quantity_remaining_kg: Number(source.quantity_remaining_kg),
        price_per_kg_inr: askingPrice,
        mandi_price_per_kg_inr: mandiPrice,
        mandi_comparison:
          diff !== null
            ? {
                difference_pct: `${diff >= 0 ? '+' : ''}${diff.toFixed(1)}%`,
                direction: diff >= 0 ? 'above' : 'below'
              }
            : null,
        harvest_date: source.harvest_date ? new Date(source.harvest_date).toISOString().slice(0, 10) : null,
        delivery_available: source.delivery_available,
        organic: source.organic,
        grade: source.grade,
        farmer: {
          kisan_id: source.farmer_kisan_id,
          trust_score: source.farmer_trust_score,
          district: source.district,
          state: source.state_code
        },
        photo_url: Array.isArray(source.photo_urls) && source.photo_urls.length > 0 ? source.photo_urls[0] : null,
        distance_km:
          query.sort === 'proximity' && hit.sort && typeof hit.sort[0] === 'number'
            ? Number(hit.sort[0])
            : null,
        expires_at: source.expires_at
      };
    });

    const nextCursor = hits.length === size && hits[hits.length - 1].sort ? encodeCursor(hits[hits.length - 1].sort!) : null;

    return {
      results,
      next_cursor: nextCursor,
      total_count: response.body.hits.total?.value ?? 0
    };
  }

  async function getFarmerListings(userId: string, status?: string, page = 1, limit = 20) {
    const offset = (page - 1) * limit;
    const params: any[] = [userId];
    let where = 'WHERE farmer_id = $1';
    if (status && status !== 'ALL') {
      params.push(status);
      where = `WHERE farmer_id = $1 AND status = $${params.length}`;
    }

    const rows = await server.db.query(
      `SELECT l.*, COALESCE(o.order_count,0) as order_count, COALESCE(o.revenue_paise,0) as revenue_paise,
         FLOOR(EXTRACT(EPOCH FROM (l.expires_at - NOW()))/86400)::int as days_until_expiry,
         COUNT(*) OVER() as total_count
       FROM public.listings l
       LEFT JOIN (
         SELECT listing_id, COUNT(*) as order_count, COALESCE(SUM(total_paise),0) as revenue_paise
         FROM public.orders
         GROUP BY listing_id
       ) o ON o.listing_id = l.id
       ${where}
       ORDER BY created_at DESC
       LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    return {
      listings: rows.rows.map((r: any) => ({
        ...r,
        revenue: Number(r.revenue_paise) / 100
      })),
      page,
      limit,
      total: rows.rows[0]?.total_count ?? 0
    };
  }

  async function updateListing(userId: string, listingId: string, payload: { asking_price_per_kg_inr?: number; quantity_kg?: number; description?: string }) {
    const result = await server.db.query('SELECT id, job_ids, farmer_id, status FROM public.listings WHERE listing_id = $1', [listingId]);
    if (result.rows.length === 0) throw server.httpErrors.notFound('Listing not found');
    const listing = result.rows[0];
    if (listing.farmer_id !== userId) throw server.httpErrors.forbidden('Not owner of listing');
    if (listing.status !== 'ACTIVE') throw server.httpErrors.badRequest('Only ACTIVE listings can be updated');

    if (listing.job_ids) {
      await removeListingLifecycleJobs(server, listing.job_ids as Record<string, string | undefined>);
    }

    const fields: string[] = [];
    const vals: any[] = [];
    let idx = 1;
    if (payload.asking_price_per_kg_inr !== undefined) {
      fields.push(`asking_price_paise = $${idx}`);
      vals.push(Math.round(payload.asking_price_per_kg_inr * 100));
      idx += 1;
    }
    if (payload.quantity_kg !== undefined) {
      fields.push(`quantity_kg = $${idx}`);
      vals.push(payload.quantity_kg);
      idx += 1;
    }
    if (payload.description !== undefined) {
      fields.push(`description = $${idx}`);
      vals.push(payload.description);
      idx += 1;
    }
    if (fields.length === 0) {
      return { updated: false };
    }

    vals.push(listingId);
    await server.db.query(`UPDATE public.listings SET ${fields.join(', ')}, updated_at = NOW() WHERE listing_id = $${idx}`, vals);

    // reschedule lifecycle and reindex
    const lifecycleIds = await scheduleListingLifecycleJobs(server, listingId);
    const indexingJob = await server.queues.listingQueue.add(INDEX_LISTING_TO_ES, { listingId }, { delay: INDEXING_DELAY_MS, removeOnComplete: true, removeOnFail: false });
    const jobIds: Record<string, string | undefined> = {};
    jobIds.expiry_warning_24h_job_id = lifecycleIds.expiry_warning_24h_job_id;
    jobIds.expiry_warning_1h_job_id = lifecycleIds.expiry_warning_1h_job_id;
    jobIds.expire_job_id = lifecycleIds.expire_job_id;
    jobIds.indexing_job_id = indexingJob.id?.toString();
    await server.db.query('UPDATE public.listings SET job_ids = $1 WHERE id = $2', [jobIds, listing.id]);

    return { updated: true };
  }

  async function deleteListing(userId: string, listingId: string) {
    const result = await server.db.query('SELECT id, job_ids, farmer_id FROM public.listings WHERE listing_id = $1', [listingId]);
    if (result.rows.length === 0) throw server.httpErrors.notFound('Listing not found');
    const listing = result.rows[0];
    if (listing.farmer_id !== userId) throw server.httpErrors.forbidden('Not owner of listing');

    // check for pending or escrow orders
    const orders = await server.db.query(
      `SELECT COUNT(*) as cnt FROM public.orders WHERE listing_id = $1 AND (payment_status = 'PENDING' OR order_status = 'PENDING' OR payment_status = 'ESCROW_HELD' OR order_status = 'ESCROW_HELD')`,
      [listing.id]
    );
    if (Number(orders.rows[0].cnt ?? 0) > 0) {
      throw server.httpErrors.badRequest('Cannot delete listing with pending or escrow orders');
    }

    if (listing.job_ids) {
      await removeListingLifecycleJobs(server, listing.job_ids as Record<string, string | undefined>);
    }

    await server.db.query(`UPDATE public.listings SET status = 'CLOSED', updated_at = NOW() WHERE id = $1`, [listing.id]);

    try {
      await server.storage.searchClient.delete({ index: server.storage.listingIndexName, id: listingId, refresh: 'wait_for' });
    } catch (err: any) {
      server.log.warn({ err, listingId }, 'failed to remove listing from search index');
    }

    return { deleted: true };
  }

  return {
    createListing,
    getPhotoUploadUrl,
    processPhoto,
    getMyListings,
    getListingById,
    cancelListing,
    searchListings,
    getFarmerListings,
    updateListing,
    deleteListing
  };
}
