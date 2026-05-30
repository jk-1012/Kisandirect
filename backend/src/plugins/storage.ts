import fp from 'fastify-plugin';
import { S3Client } from '@aws-sdk/client-s3';
import { Client as OpenSearchClient } from '@opensearch-project/opensearch';
import { FastifyInstance } from 'fastify';

const DEFAULT_REGION = 'ap-south-1';
const DEFAULT_INDEX_NAME = 'kisandirect-listings';
const EXPIRY_CHECK_MS = 1000 * 60 * 5;

async function ensureIndex(client: OpenSearchClient, indexName: string) {
  const exists = await client.indices.exists({ index: indexName });
  if (exists.statusCode === 404 || exists.body === false) {
    await client.indices.create({
      index: indexName,
      body: {
        settings: {
          number_of_shards: 3,
          number_of_replicas: 1,
          analysis: {
            analyzer: {
              multilingual_analyzer: {
                tokenizer: 'standard',
                filter: ['lowercase', 'asciifolding']
              }
            }
          }
        },
        mappings: {
          properties: {
            listing_id: { type: 'keyword' },
            farmer_id: { type: 'keyword' },
            farmer_kisan_id: { type: 'keyword' },
            farmer_trust_score: { type: 'integer' },
            crop_type: { type: 'keyword' },
            crop_type_display: {
              type: 'text',
              analyzer: 'multilingual_analyzer',
              fields: { keyword: { type: 'keyword' } }
            },
            crop_category: { type: 'keyword' },
            quantity_kg: { type: 'float' },
            quantity_remaining_kg: { type: 'float' },
            asking_price_paise: { type: 'integer' },
            mandi_price_paise: { type: 'integer' },
            harvest_date: { type: 'date', format: 'yyyy-MM-dd' },
            delivery_available: { type: 'boolean' },
            organic: { type: 'boolean' },
            grade: { type: 'keyword' },
            status: { type: 'keyword' },
            state_code: { type: 'keyword' },
            district: {
              type: 'text',
              fields: { keyword: { type: 'keyword' } }
            },
            description: { type: 'text', analyzer: 'multilingual_analyzer' },
            location: { type: 'geo_point' },
            photo_urls: { type: 'keyword', index: false },
            has_photo: { type: 'boolean' },
            expires_at: { type: 'date' },
            created_at: { type: 'date' },
            view_count: { type: 'integer' }
          }
        }
      }
    });
  }
}

export const storagePlugin = fp(async (server: FastifyInstance) => {
  const bucketName = process.env.AWS_S3_BUCKET;
  const region = process.env.AWS_REGION ?? DEFAULT_REGION;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const endpoint = process.env.AWS_S3_ENDPOINT;
  const opensearchUrl = process.env.OPENSEARCH_URL;
  const cloudfrontDomain = process.env.CLOUDFRONT_DOMAIN ?? '';
  const listingIndexName = process.env.LISTING_INDEX_NAME ?? DEFAULT_INDEX_NAME;

  if (!bucketName || !accessKeyId || !secretAccessKey || !opensearchUrl) {
    throw new Error('AWS_S3_BUCKET, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and OPENSEARCH_URL are required for storage plugin');
  }

  const s3ClientConfig: any = {
    region,
    credentials: {
      accessKeyId,
      secretAccessKey
    }
  };

  if (endpoint) {
    s3ClientConfig.endpoint = endpoint;
    s3ClientConfig.forcePathStyle = true;
  }

  const s3Client = new S3Client(s3ClientConfig);

  const searchClient = new OpenSearchClient({ node: opensearchUrl });
  await ensureIndex(searchClient, listingIndexName);

  server.decorate('storage', {
    s3Client,
    bucketName,
    region,
    cloudfrontDomain,
    searchClient,
    listingIndexName
  });

  async function expireListings() {
    try {
      const { rowCount } = await server.db.query(
        `UPDATE public.listings SET status = 'EXPIRED', updated_at = NOW() WHERE status = 'ACTIVE' AND expires_at <= NOW()`
      );

      if (rowCount > 0) {
        await searchClient.updateByQuery({
          index: listingIndexName,
          refresh: true,
          body: {
            script: {
              source: "ctx._source.status = params.status",
              params: { status: 'EXPIRED' }
            },
            query: {
              bool: {
                must: [
                  { term: { status: 'ACTIVE' } },
                  { range: { expires_at: { lte: 'now' } } }
                ]
              }
            }
          }
        });
        server.log.info({ expired: rowCount }, 'expired listings updated');
      }
    } catch (error) {
      server.log.error({ error }, 'failed to expire listings');
    }
  }

  const interval = setInterval(expireListings, EXPIRY_CHECK_MS);
  server.addHook('onClose', async () => {
    clearInterval(interval);
    await searchClient.close();
  });
});

declare module 'fastify' {
  interface FastifyInstance {
    storage: {
      s3Client: S3Client;
      bucketName: string;
      region: string;
      cloudfrontDomain: string;
      searchClient: OpenSearchClient;
      listingIndexName: string;
    };
  }
}
