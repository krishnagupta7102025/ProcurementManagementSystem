import { ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { StorageService } from './storage.service.js';

describe('StorageService (P2P-005)', () => {
  it('builds keys under the org prefix', () => {
    const storage = new StorageService();
    expect(storage.buildKey('org-a', 'invoices/1.pdf')).toBe('org-a/invoices/1.pdf');
  });

  it('rejects fetching a URL for a key that belongs to a different org', async () => {
    const storage = new StorageService();
    const keyFromOrgA = storage.buildKey('org-a', 'invoices/1.pdf');

    await expect(storage.getDownloadUrl('org-b', keyFromOrgA)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(
      storage.getUploadUrl('org-b', keyFromOrgA, 'application/pdf'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
