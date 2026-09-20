/**
 * DEV_AUTH_BYPASS lets local testing skip real Central Login JWT
 * verification entirely (see OidcAuthGuard's dev-bypass path) — added so
 * the API can actually be exercised over HTTP before a real OIDC issuer
 * exists. This must never be reachable in production, so it's checked
 * independently in two places: here (evaluated on every request) and in
 * main.ts (evaluated once at boot, hard-exiting the process if the
 * combination is ever seen). Never remove the NODE_ENV check from either
 * place on the assumption the other one already covers it.
 */
export function isDevAuthBypassEnabled(): boolean {
  return process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV !== 'production';
}

export function assertDevAuthBypassNotInProduction(): void {
  if (process.env.DEV_AUTH_BYPASS === 'true' && process.env.NODE_ENV === 'production') {
    throw new Error(
      'DEV_AUTH_BYPASS=true with NODE_ENV=production — refusing to start. ' +
        'This bypass skips all real authentication and must never run in production.',
    );
  }
}
