import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertDevAuthBypassNotInProduction, isDevAuthBypassEnabled } from './dev-auth-bypass.js';

describe('dev-auth-bypass safety gate', () => {
  // This machine's own apps/api/.env sets DEV_AUTH_BYPASS=true for local
  // testing (see docs/99-build-guide.md) — clear it before each test too,
  // not just after, so that ambient setting never leaks into a test's
  // starting state.
  beforeEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.DEV_AUTH_BYPASS;
    delete process.env.NODE_ENV;
  });

  describe('isDevAuthBypassEnabled', () => {
    it('is false when DEV_AUTH_BYPASS is unset', () => {
      expect(isDevAuthBypassEnabled()).toBe(false);
    });

    it('is true when set and NODE_ENV is not production', () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'development';
      expect(isDevAuthBypassEnabled()).toBe(true);
    });

    it('is false when NODE_ENV is production, regardless of the flag', () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'production';
      expect(isDevAuthBypassEnabled()).toBe(false);
    });
  });

  describe('assertDevAuthBypassNotInProduction', () => {
    it('does not throw when the flag is unset', () => {
      process.env.NODE_ENV = 'production';
      expect(() => assertDevAuthBypassNotInProduction()).not.toThrow();
    });

    it('does not throw when NODE_ENV is not production', () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'development';
      expect(() => assertDevAuthBypassNotInProduction()).not.toThrow();
    });

    it('throws when the flag is set with NODE_ENV=production — the one combination that must be impossible', () => {
      process.env.DEV_AUTH_BYPASS = 'true';
      process.env.NODE_ENV = 'production';
      expect(() => assertDevAuthBypassNotInProduction()).toThrow(/production/);
    });
  });
});
