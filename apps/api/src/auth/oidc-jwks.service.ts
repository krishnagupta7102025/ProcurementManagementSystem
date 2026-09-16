import { Injectable } from '@nestjs/common';
import { createRemoteJWKSet, type JWTVerifyGetKey } from 'jose';

interface DiscoveryDocument {
  jwks_uri: string;
}

@Injectable()
export class OidcJwksService {
  private jwksPromise: Promise<JWTVerifyGetKey> | undefined;

  /**
   * Lazily discovers and caches the issuer's JWKS via standard OIDC
   * discovery (`/.well-known/openid-configuration`). This part is generic
   * OIDC behavior, not specific to Central Login — but whether Central
   * Login actually exposes standard discovery at all, and the exact
   * issuer URL, are unconfirmed (docs/00-prd.md §11). Confirm with the
   * platform team before relying on this against a real environment.
   */
  getJwks(issuer: string): Promise<JWTVerifyGetKey> {
    if (!this.jwksPromise) {
      this.jwksPromise = this.discover(issuer);
    }
    return this.jwksPromise;
  }

  private async discover(issuer: string): Promise<JWTVerifyGetKey> {
    const discoveryUrl = new URL('/.well-known/openid-configuration', issuer);
    const response = await fetch(discoveryUrl);
    if (!response.ok) {
      throw new Error(`OIDC discovery failed for ${issuer}: ${response.status}`);
    }
    const doc = (await response.json()) as DiscoveryDocument;
    return createRemoteJWKSet(new URL(doc.jwks_uri));
  }
}
