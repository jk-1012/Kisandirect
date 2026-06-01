/**
 * Photo Compression Worker
 * Handles photo resizing and Vision API moderation with DLQ support
 */

import { Job } from 'bullmq';
import { FastifyInstance } from 'fastify';
import sharp from 'sharp';
import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';

const MAX_VISION_TIMEOUT = 5000;
const SAFE_FLAGGED = new Set(['LIKELY', 'VERY_LIKELY']);
const SENSITIVE_KEYWORDS = [
  'currency',
  'money',
  'rupee',
  'cash',
  'banknote',
  'note',
  'bill',
  'face',
  'faces',
  'person',
  'people',
  'human',
  'portrait',
];

export interface PhotoCompressionJob {
  photoKey: string;
  listingId: string;
  farmerUserId: string;
  fileName: string;
  bucketName: string;
}

export interface PhotoCompressionResult {
  originalKey: string;
  thumbKey: string;
  mediumKey: string;
  moderation: {
    flagged: boolean;
    safeSearch: any[];
    labels: string[];
  };
}

async function streamToBuffer(stream: any): Promise<Buffer> {
  if (!stream) {
    return Buffer.from([]);
  }

  if (typeof stream?.arrayBuffer === 'function') {
    const buffer = await stream.arrayBuffer();
    return Buffer.from(buffer);
  }

  return new Promise((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    stream.on('data', (chunk: Uint8Array) => chunks.push(chunk));
    stream.on('end', () => resolve(Buffer.concat(chunks)));
    stream.on('error', reject);
  });
}

function labelTriggersModeration(label: string): boolean {
  const normalized = label.toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => normalized.includes(keyword));
}

export async function photoCompressionHandler(
  job: Job<PhotoCompressionJob>,
  server: FastifyInstance,
): Promise<PhotoCompressionResult> {
  const { photoKey, bucketName, listingId, farmerUserId, fileName } = job.data;

  try {
    server.log.info(
      { jobId: job.id, photoKey, bucketName, fileName },
      'Starting photo compression job',
    );

    // Download original photo from S3
    const getCommand = new GetObjectCommand({
      Bucket: bucketName,
      Key: photoKey,
    });

    const response = await server.storage.s3Client.send(getCommand);
    const photoBuffer = await streamToBuffer(response.Body);

    if (!photoBuffer || photoBuffer.length === 0) {
      throw new Error(`Failed to download photo from S3: ${photoKey}`);
    }

    // Resize to thumbnail (200x200)
    const thumbBuffer = await sharp(photoBuffer)
      .resize(200, 200, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 80 })
      .toBuffer();

    // Resize to medium (800x800)
    const mediumBuffer = await sharp(photoBuffer)
      .resize(800, 800, { fit: 'cover', position: 'center' })
      .jpeg({ quality: 85 })
      .toBuffer();

    // Generate consistent keys based on original
    const baseName = photoKey.replace(/\.[^.]+$/, '');
    const thumbKey = `${baseName}-thumb.jpg`;
    const mediumKey = `${baseName}-medium.jpg`;

    // Upload resized photos
    await Promise.all([
      server.storage.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: thumbKey,
          Body: thumbBuffer,
          ContentType: 'image/jpeg',
          Metadata: {
            'listing-id': listingId,
            'farmer-user-id': farmerUserId,
            'original-file': fileName,
          },
        }),
      ),
      server.storage.s3Client.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: mediumKey,
          Body: mediumBuffer,
          ContentType: 'image/jpeg',
          Metadata: {
            'listing-id': listingId,
            'farmer-user-id': farmerUserId,
            'original-file': fileName,
          },
        }),
      ),
    ]);

    server.log.info(
      { jobId: job.id, thumbKey, mediumKey },
      'Photo resized and uploaded successfully',
    );

    // Call Vision API for moderation (with timeout)
    const moderationResult = {
      flagged: false,
      safeSearch: [] as any[],
      labels: [] as string[],
    };

    try {
      const apiKey = process.env.GOOGLE_CLOUD_VISION_API_KEY;
      if (!apiKey) {
        server.log.info({ jobId: job.id }, 'Vision API key not configured, skipping moderation');
      } else {
        const controller = new AbortController();
        const timeoutHandle = setTimeout(() => controller.abort(), MAX_VISION_TIMEOUT);

        try {
          const visionResponse = await fetch(
            `https://vision.googleapis.com/v1/images:annotate?key=${encodeURIComponent(apiKey)}`,
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                requests: [
                  {
                    image: { source: { gcsImageUri: `gs://${bucketName}/${photoKey}` } },
                    features: [
                      { type: 'LABEL_DETECTION', maxResults: 10 },
                      { type: 'SAFE_SEARCH_DETECTION' },
                    ],
                  },
                ],
              }),
              signal: controller.signal,
            } as any,
          );

          clearTimeout(timeoutHandle);

          if (visionResponse.ok) {
            const json = (await visionResponse.json()) as any;
            const labels = json.responses?.[0]?.labelAnnotations as
              | Array<{ description?: string; score?: number }>
              | undefined;
            const safeSearch = json.responses?.[0]?.safeSearchAnnotation as
              | Record<string, string>
              | undefined;

            if (labels?.length) {
              moderationResult.labels = labels
                .filter((l: any) => l.description)
                .map((l: any) => l.description);

              // Check if any label triggers moderation
              const shouldFlagImage = labels.some((label: any) =>
                labelTriggersModeration(label.description),
              );

              if (shouldFlagImage) {
                moderationResult.flagged = true;
              }
            }

            if (safeSearch) {
              moderationResult.safeSearch = Object.entries(safeSearch);

              // Check safe search flags
              for (const [key, value] of Object.entries(safeSearch)) {
                if (SAFE_FLAGGED.has(String(value))) {
                  moderationResult.flagged = true;
                  server.log.warn(
                    { jobId: job.id, photoKey, safeSearchKey: key, flagValue: value },
                    'Photo flagged for moderation (safe search)',
                  );
                }
              }
            }

            if (moderationResult.flagged) {
              server.log.warn(
                { jobId: job.id, photoKey, listingId, labels: moderationResult.labels },
                'Photo flagged for content moderation',
              );
            }
          } else if (visionResponse.status === 429) {
            server.log.warn({ jobId: job.id, status: 429 }, 'Vision API quota exceeded');
          } else {
            server.log.warn(
              { jobId: job.id, status: visionResponse.status },
              'Vision API error',
            );
          }
        } catch (visionError: any) {
          if (visionError?.name === 'AbortError') {
            server.log.warn({ jobId: job.id, photoKey }, 'Vision API timeout');
          } else {
            server.log.warn(
              { jobId: job.id, photoKey, error: visionError?.message },
              'Vision API request failed',
            );
          }
        }
      }
    } catch (error: any) {
      server.log.warn(
        { jobId: job.id, photoKey, error: error?.message },
        'Vision API moderation failed - continuing',
      );
      // Don't fail the job if Vision API fails - it's optional
    }

    const result: PhotoCompressionResult = {
      originalKey: photoKey,
      thumbKey,
      mediumKey,
      moderation: moderationResult,
    };

    server.log.info(
      { jobId: job.id, result },
      'Photo compression job completed successfully',
    );

    return result;
  } catch (error: any) {
    server.log.error(
      {
        jobId: job.id,
        photoKey,
        error: error?.message,
        stack: error?.stack,
        attemptsMade: job.attemptsMade,
      },
      'Photo compression job failed',
    );

    throw error;
  }
}

/**
 * Configuration for photo compression worker
 */
export const photoCompressionWorkerConfig = {
  name: 'photo-processing',
  defaultJobOptions: {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000, // Start with 2 seconds, exponential backoff
    },
    removeOnComplete: {
      age: 3600, // Remove after 1 hour
    },
    removeOnFail: false, // Keep failed jobs for analysis
    timeout: 30000, // 30 second timeout per job
  },
  concurrency: 5,
  settings: {
    maxStalledCount: 3,
    maxStalledInterval: 30000, // Check every 30 seconds
    lockDuration: 30000,
  },
};
