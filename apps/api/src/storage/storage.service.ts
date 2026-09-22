import { ForbiddenException, Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { isLocalStorageEnabled } from './dev-local-storage.js';

const SIGNED_URL_TTL_SECONDS = 300;
const LOCAL_STORAGE_DIR = process.env.LOCAL_STORAGE_DIR ?? '.local-storage';
const LOCAL_STORAGE_PUBLIC_URL =
  process.env.LOCAL_STORAGE_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 3001}`;

/**
 * S3-backed document storage (P2P-005), scoped per org via a mandatory
 * `${orgId}/...` key prefix. Every method rejects a key that doesn't belong
 * to the given orgId, so one tenant's session can never mint a URL for
 * another tenant's object even if it somehow learned the raw key.
 *
 * When STORAGE_DRIVER=local (dev only — see dev-local-storage.ts), writes
 * and reads go to the local filesystem instead of S3, and getDownloadUrl
 * points at StorageController's dev-only download route rather than a
 * presigned S3 URL.
 */
@Injectable()
export class StorageService {
  // S3_ENDPOINT is only set for an S3-compatible provider that isn't AWS
  // itself (e.g. Cloudflare R2) — real AWS resolves its endpoint from the
  // region alone. R2 in particular requires forcePathStyle (per Cloudflare's
  // own S3-compatibility docs), which real AWS also accepts fine, so it's
  // safe to apply whenever a custom endpoint is set.
  private readonly client = isLocalStorageEnabled()
    ? undefined
    : new S3Client({
        region: process.env.S3_REGION,
        ...(process.env.S3_ENDPOINT
          ? { endpoint: process.env.S3_ENDPOINT, forcePathStyle: true }
          : {}),
      });
  private readonly bucket = process.env.S3_BUCKET as string;

  buildKey(orgId: string, path: string): string {
    return `${orgId}/${path}`;
  }

  private assertOwnedKey(orgId: string, key: string): void {
    if (!key.startsWith(`${orgId}/`)) {
      throw new ForbiddenException('Key does not belong to this org');
    }
  }

  async getUploadUrl(orgId: string, key: string, contentType: string): Promise<string> {
    this.assertOwnedKey(orgId, key);
    if (isLocalStorageEnabled()) {
      throw new Error(
        'Direct client uploads are not supported by the local storage dev driver — generate the content server-side and call putObject instead.',
      );
    }
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client!, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  async getDownloadUrl(orgId: string, key: string): Promise<string> {
    this.assertOwnedKey(orgId, key);
    if (isLocalStorageEnabled()) {
      return `${LOCAL_STORAGE_PUBLIC_URL}/storage/download?key=${encodeURIComponent(key)}`;
    }
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client!, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  /**
   * Direct server-side upload — for content generated in-process (e.g. a
   * PDF), as opposed to getUploadUrl's client-side presigned PUT flow.
   */
  async putObject(
    orgId: string,
    key: string,
    body: Uint8Array,
    contentType: string,
  ): Promise<void> {
    this.assertOwnedKey(orgId, key);
    if (isLocalStorageEnabled()) {
      const filePath = join(LOCAL_STORAGE_DIR, key);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, body);
      return;
    }
    await this.client!.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType }),
    );
  }

  /** Local-driver-only: reads a previously putObject'd file back — used by StorageController's download route. */
  async readLocalObject(orgId: string, key: string): Promise<Buffer> {
    this.assertOwnedKey(orgId, key);
    return readFile(join(LOCAL_STORAGE_DIR, key));
  }
}
