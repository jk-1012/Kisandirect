import { FastifyInstance } from 'fastify';
import { CROP_TAXONOMY } from '../../../data/cropTaxonomy.js';

export const EXPIRY_WARNING_24H = 'EXPIRY_WARNING_24H';
export const EXPIRY_WARNING_1H = 'EXPIRY_WARNING_1H';
export const LISTING_EXPIRE = 'LISTING_EXPIRE';

function getCropDisplayName(cropCategory: string, cropType: string) {
  const category = CROP_TAXONOMY[cropCategory as keyof typeof CROP_TAXONOMY];
  if (!category) {
    return cropType;
  }
  const crop = category[cropType as keyof typeof category] as any;
  return crop?.label?.en ?? cropType;
}

async function sendWhatsAppTemplate(server: FastifyInstance, payload: Record<string, any>) {
  const apiUrl = process.env.WHATSAPP_API_URL;
  const token = process.env.WHATSAPP_API_TOKEN;

  if (!apiUrl || !token) {
    server.log.warn('WhatsApp configuration missing, lifecycle notification not sent');
    return;
  }

  try {
    await fetch(apiUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });
  } catch (error) {
    server.log.error({ error, payload }, 'Failed to send WhatsApp lifecycle template');
  }
}

async function getListingWithFarmer(server: FastifyInstance, listingId: string) {
  const result = await server.db.query(
    `SELECT l.listing_id, l.crop_type, l.crop_category, l.asking_price_paise, l.status,
            u.phone AS farmer_phone, u.language AS farmer_language
     FROM public.listings l
     JOIN public.users u ON l.farmer_id = u.id
     WHERE l.listing_id = $1`,
    [listingId]
  );
  return result.rows[0] ?? null;
}

async function getListingById(server: FastifyInstance, listingId: string) {
  const result = await server.db.query('SELECT * FROM public.listings WHERE listing_id = $1', [listingId]);
  return result.rows[0] ?? null;
}

export async function expiryWarning24h(server: FastifyInstance, listingId: string) {
  const listing = await getListingWithFarmer(server, listingId);
  if (!listing || listing.status !== 'ACTIVE') {
    return null;
  }

  const cropTypeDisplay = getCropDisplayName(listing.crop_category, listing.crop_type);
  await sendWhatsAppTemplate(server, {
    to: `91${listing.farmer_phone}`,
    language: listing.farmer_language ?? 'en',
    template: 'listing_expiry_24h',
    components: {
      body: {
        parameters: [
          { type: 'text', text: cropTypeDisplay },
          { type: 'text', text: `₹${(listing.asking_price_paise / 100).toFixed(2)}` }
        ]
      },
      buttons: [
        { type: 'reply', reply: { id: `relist:${listingId}`, title: 'Relist Now' } },
        { type: 'reply', reply: { id: `close:${listingId}`, title: 'Close Listing' } }
      ]
    }
  });

  return { listingId, status: 'queued' };
}

export async function expiryWarning1h(server: FastifyInstance, listingId: string) {
  const listing = await getListingWithFarmer(server, listingId);
  if (!listing || listing.status !== 'ACTIVE') {
    return null;
  }

  const cropTypeDisplay = getCropDisplayName(listing.crop_category, listing.crop_type);
  await sendWhatsAppTemplate(server, {
    to: `91${listing.farmer_phone}`,
    language: listing.farmer_language ?? 'en',
    template: 'listing_expiry_1h',
    components: {
      body: {
        parameters: [{ type: 'text', text: cropTypeDisplay }]
      }
    }
  });

  return { listingId, status: 'queued' };
}

export async function expireListing(server: FastifyInstance, listingId: string) {
  const listing = await getListingById(server, listingId);
  if (!listing || listing.status !== 'ACTIVE') {
    return null;
  }

  await server.db.query(
    'UPDATE public.listings SET status = $1, updated_at = NOW() WHERE listing_id = $2',
    ['EXPIRED', listingId]
  );

  try {
    await server.storage.searchClient.delete({ index: server.storage.listingIndexName, id: listingId });
  } catch (error: any) {
    if (error?.statusCode !== 404) {
      server.log.error({ error, listingId }, 'Failed to delete expired listing from search index');
    }
  }

  const cropTypeDisplay = getCropDisplayName(listing.crop_category, listing.crop_type);
  await sendWhatsAppTemplate(server, {
    to: `91${listing.farmer_phone}`,
    language: listing.farmer_language ?? 'en',
    template: 'listing_expired',
    components: {
      body: {
        parameters: [{ type: 'text', text: cropTypeDisplay }]
      }
    }
  });

  return { listingId, status: 'expired' };
}

export async function scheduleListingLifecycleJobs(server: FastifyInstance, listingId: string) {
  const expiry24hJob = await server.queues.listingQueue.add(EXPIRY_WARNING_24H, { listingId }, { delay: 48 * 60 * 60 * 1000, removeOnComplete: true, removeOnFail: false });
  const expiry1hJob = await server.queues.listingQueue.add(EXPIRY_WARNING_1H, { listingId }, { delay: 71 * 60 * 60 * 1000, removeOnComplete: true, removeOnFail: false });
  const expireJob = await server.queues.listingQueue.add(LISTING_EXPIRE, { listingId }, { delay: 72 * 60 * 60 * 1000, removeOnComplete: true, removeOnFail: false });

  return {
    expiry_warning_24h_job_id: expiry24hJob.id?.toString(),
    expiry_warning_1h_job_id: expiry1hJob.id?.toString(),
    expire_job_id: expireJob.id?.toString()
  };
}

export async function removeListingLifecycleJobs(server: FastifyInstance, jobIds: Record<string, string | undefined>) {
  const removeCalls: Promise<any>[] = [];
  if (jobIds.expiry_warning_24h_job_id) {
    removeCalls.push(server.queues.listingQueue.remove(jobIds.expiry_warning_24h_job_id));
  }
  if (jobIds.expiry_warning_1h_job_id) {
    removeCalls.push(server.queues.listingQueue.remove(jobIds.expiry_warning_1h_job_id));
  }
  if (jobIds.expire_job_id) {
    removeCalls.push(server.queues.listingQueue.remove(jobIds.expire_job_id));
  }
  await Promise.all(removeCalls);
}
