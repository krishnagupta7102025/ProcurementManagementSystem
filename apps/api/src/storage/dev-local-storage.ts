/**
 * STORAGE_DRIVER=local swaps StorageService's S3 calls for reads/writes
 * against the local filesystem, served back by StorageController — added
 * so PO PDFs (and future invoice/requisition attachments) can actually be
 * generated and downloaded in this dev environment, which has no real S3
 * bucket or AWS credentials configured (see apps/api/.env). Mirrors the
 * DEV_AUTH_BYPASS pattern: checked independently here (evaluated per call)
 * and in main.ts (evaluated once at boot). Local files aren't durable or
 * shared across instances, so this must never run in production.
 */
export function isLocalStorageEnabled(): boolean {
  return process.env.STORAGE_DRIVER === 'local' && process.env.NODE_ENV !== 'production';
}

export function assertLocalStorageNotInProduction(): void {
  if (process.env.STORAGE_DRIVER === 'local' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'STORAGE_DRIVER=local with NODE_ENV=production — refusing to start. ' +
        'Local filesystem storage is a dev-only stand-in for S3 and must never run in production.',
    );
  }
}
