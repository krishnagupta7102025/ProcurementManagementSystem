import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { assertLocalStorageNotInProduction, isLocalStorageEnabled } from './dev-local-storage.js';

describe('local storage dev-driver safety gate', () => {
  beforeEach(() => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    delete process.env.STORAGE_DRIVER;
    delete process.env.NODE_ENV;
  });

  describe('isLocalStorageEnabled', () => {
    it('is false when STORAGE_DRIVER is unset', () => {
      expect(isLocalStorageEnabled()).toBe(false);
    });

    it('is true when set to local and NODE_ENV is not production', () => {
      process.env.STORAGE_DRIVER = 'local';
      process.env.NODE_ENV = 'development';
      expect(isLocalStorageEnabled()).toBe(true);
    });

    it('is false when NODE_ENV is production, regardless of the driver setting', () => {
      process.env.STORAGE_DRIVER = 'local';
      process.env.NODE_ENV = 'production';
      expect(isLocalStorageEnabled()).toBe(false);
    });
  });

  describe('assertLocalStorageNotInProduction', () => {
    it('does not throw when the driver is unset', () => {
      process.env.NODE_ENV = 'production';
      expect(() => assertLocalStorageNotInProduction()).not.toThrow();
    });

    it('does not throw when NODE_ENV is not production', () => {
      process.env.STORAGE_DRIVER = 'local';
      process.env.NODE_ENV = 'development';
      expect(() => assertLocalStorageNotInProduction()).not.toThrow();
    });

    it('throws when the driver is local with NODE_ENV=production — the one combination that must be impossible', () => {
      process.env.STORAGE_DRIVER = 'local';
      process.env.NODE_ENV = 'production';
      expect(() => assertLocalStorageNotInProduction()).toThrow(/production/);
    });
  });
});
