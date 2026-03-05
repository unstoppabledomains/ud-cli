import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { createMemoryStore } from '../helpers/memoryStore.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';
import { isMagicLinkUrl, createMagicLinkUrl, applyMagicLinks } from '../../src/lib/magic-link.js';

describe('magic-link', () => {
  let memStore: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    clearEnvOverride();
    config.clear();
    config.set('environment', 'production');
    config.set('environments.production', { authMethod: 'api-key' });
    memStore = createMemoryStore();
    _setStore(memStore);
    setupMockFetch();
  });

  afterEach(() => {
    teardownMockFetch();
  });

  describe('isMagicLinkUrl', () => {
    it('returns true for magic link URLs', () => {
      expect(isMagicLinkUrl(
        'https://api.unstoppabledomains.com/api/oauth/link?token=abc123&redirect=https%3A%2F%2Fud.me',
      )).toBe(true);
    });

    it('returns true regardless of base domain', () => {
      expect(isMagicLinkUrl(
        'https://api.ud-staging.com/api/oauth/link?token=xyz',
      )).toBe(true);
    });

    it('returns false for regular URLs', () => {
      expect(isMagicLinkUrl('https://ud.me/checkout/abc')).toBe(false);
    });

    it('returns false for URLs without token param', () => {
      expect(isMagicLinkUrl(
        'https://api.unstoppabledomains.com/api/oauth/link?redirect=https://ud.me',
      )).toBe(false);
    });

    it('returns false for invalid URLs', () => {
      expect(isMagicLinkUrl('not-a-url')).toBe(false);
    });

    it('returns false for empty string', () => {
      expect(isMagicLinkUrl('')).toBe(false);
    });
  });

  describe('createMagicLinkUrl', () => {
    it('wraps URL with magic link when authenticated', async () => {
      await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');

      mockFetchRoute('/api/oauth/link', () =>
        jsonResponse({ link_token: 'magic-token-123', expires_in: 60 }),
      );

      const result = await createMagicLinkUrl('https://ud.me/checkout/abc');
      expect(result).toContain('/api/oauth/link');
      expect(result).toContain('token=magic-token-123');
      expect(result).toContain('redirect=');
      expect(result).toContain('checkout');
    });

    it('returns raw URL when magic link API returns error', async () => {
      await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');

      mockFetchRoute('/api/oauth/link', () =>
        jsonResponse({ error: 'rate_limit_exceeded' }, 429),
      );

      const url = 'https://ud.me/checkout/abc';
      expect(await createMagicLinkUrl(url)).toBe(url);
    });

    it('returns raw URL when not authenticated', async () => {
      // No credentials saved
      const url = 'https://ud.me/checkout/abc';
      // Will get 404 from mock fetch (no route matched) or auth header will be null
      expect(await createMagicLinkUrl(url)).toBe(url);
    });

    it('does not double-wrap magic link URLs', async () => {
      await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');

      const magicUrl = 'https://api.unstoppabledomains.com/api/oauth/link?token=existing&redirect=https://ud.me';
      expect(await createMagicLinkUrl(magicUrl)).toBe(magicUrl);
    });

    it('returns raw URL when API returns no link_token', async () => {
      await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');

      mockFetchRoute('/api/oauth/link', () =>
        jsonResponse({ unexpected: 'response' }),
      );

      const url = 'https://ud.me/checkout/abc';
      expect(await createMagicLinkUrl(url)).toBe(url);
    });
  });

  describe('applyMagicLinks', () => {
    beforeEach(async () => {
      await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');
      mockFetchRoute('/api/oauth/link', () =>
        jsonResponse({ link_token: 'tok', expires_in: 60 }),
      );
    });

    it('replaces URL fields in result object', async () => {
      const result: Record<string, unknown> = {
        checkoutUrl: 'https://ud.me/checkout/abc',
        otherField: 'keep',
      };
      await applyMagicLinks(result, ['checkoutUrl']);

      expect(result.checkoutUrl).toContain('token=tok');
      expect(result.otherField).toBe('keep');
    });

    it('handles dotted paths', async () => {
      const result: Record<string, unknown> = {
        nested: { url: 'https://ud.me/pay' },
      };
      await applyMagicLinks(result, ['nested.url']);

      const nested = result.nested as Record<string, unknown>;
      expect(nested.url).toContain('token=tok');
    });

    it('skips non-URL string values', async () => {
      const result: Record<string, unknown> = { checkoutUrl: 'not-a-url' };
      await applyMagicLinks(result, ['checkoutUrl']);
      expect(result.checkoutUrl).toBe('not-a-url');
    });

    it('skips non-string values', async () => {
      const result: Record<string, unknown> = { count: 42 };
      await applyMagicLinks(result, ['count']);
      expect(result.count).toBe(42);
    });

    it('skips missing fields gracefully', async () => {
      const result: Record<string, unknown> = { other: 'value' };
      await applyMagicLinks(result, ['nonExistent']);
      expect(result).toEqual({ other: 'value' });
    });

    it('skips when nested path does not exist', async () => {
      const result: Record<string, unknown> = { other: 'value' };
      await applyMagicLinks(result, ['deep.nested.url']);
      expect(result).toEqual({ other: 'value' });
    });
  });
});
