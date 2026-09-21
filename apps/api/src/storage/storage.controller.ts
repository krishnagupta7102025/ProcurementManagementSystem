import { Controller, Get, NotFoundException, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import type { AuthenticatedUser } from '../auth/auth.types.js';
import { OidcAuthGuard } from '../auth/oidc-auth.guard.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { isLocalStorageEnabled } from './dev-local-storage.js';
import { StorageService } from './storage.service.js';

function contentTypeFor(key: string): string {
  if (key.endsWith('.pdf')) return 'application/pdf';
  if (key.endsWith('.csv')) return 'text/csv';
  return 'application/octet-stream';
}

/**
 * Dev-only stand-in for what a real S3 presigned URL would serve directly.
 * In production, StorageService.getDownloadUrl() returns a presigned S3
 * URL that goes straight to S3 and never touches this API — this route
 * only exists because STORAGE_DRIVER=local (see dev-local-storage.ts)
 * points getDownloadUrl() here instead.
 */
@UseGuards(OidcAuthGuard)
@Controller('storage')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Get('download')
  async download(@CurrentUser() user: AuthenticatedUser, @Query('key') key: string, @Res() res: Response) {
    if (!isLocalStorageEnabled()) {
      throw new NotFoundException();
    }
    let bytes: Buffer;
    try {
      bytes = await this.storage.readLocalObject(user.orgId, key);
    } catch {
      throw new NotFoundException(`No object found for key "${key}"`);
    }
    res.setHeader('Content-Type', contentTypeFor(key));
    res.send(bytes);
  }
}
