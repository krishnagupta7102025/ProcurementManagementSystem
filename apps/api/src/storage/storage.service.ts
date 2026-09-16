import { ForbiddenException, Injectable } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const SIGNED_URL_TTL_SECONDS = 300;

/**
 * S3-backed document storage (P2P-005), scoped per org via a mandatory
 * `${orgId}/...` key prefix. Every method rejects a key that doesn't belong
 * to the given orgId, so one tenant's session can never mint a URL for
 * another tenant's object even if it somehow learned the raw key.
 */
@Injectable()
export class StorageService {
  private readonly client = new S3Client({ region: process.env.S3_REGION });
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
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    return getSignedUrl(this.client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }

  async getDownloadUrl(orgId: string, key: string): Promise<string> {
    this.assertOwnedKey(orgId, key);
    const command = new GetObjectCommand({ Bucket: this.bucket, Key: key });
    return getSignedUrl(this.client, command, { expiresIn: SIGNED_URL_TTL_SECONDS });
  }
}
