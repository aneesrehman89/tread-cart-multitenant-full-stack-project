import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '../config/env.js';

/**
 * One S3 client for the process. Locally this points at MinIO; in staging and
 * production leave S3_ENDPOINT unset and it talks to real Amazon S3.
 */
export const s3 = new S3Client({
  region: env.S3_REGION,
  ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}),
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY_ID,
    secretAccessKey: env.S3_SECRET_ACCESS_KEY,
  },
});

/**
 * Object keys are namespaced by tenant so a signed URL for one tenant can
 * never be pointed at another tenant's media by editing the path.
 */
export function tenantObjectKey(tenantSlug: string, ...parts: string[]): string {
  return ['tenants', tenantSlug, ...parts].join('/');
}

/** Browser uploads go straight to S3 with a short-lived signed PUT URL. */
export async function createUploadUrl(
  key: string,
  contentType: string,
  expiresIn = 300,
): Promise<string> {
  return getSignedUrl(
    s3,
    new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, ContentType: contentType }),
    { expiresIn },
  );
}

/** Reads are signed too, so the bucket itself can stay private. */
export async function createDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }), {
    expiresIn,
  });
}

export async function deleteObject(key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
}
