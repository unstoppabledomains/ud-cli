import { jest } from '@jest/globals';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { createMemoryStore } from '../helpers/memoryStore.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';

// Mock child_process.spawn before importing magic-link (which uses it)
const unrefMock = jest.fn();
const spawnMock = jest.fn(() => ({ unref: unrefMock }));
jest.unstable_mockModule('node:child_process', () => ({
  spawn: spawnMock,
}));

// Dynamic import so the module picks up the child_process mock
const { isMagicLinkUrl, createMagicLinkUrl, applyMagicLinks, openInBrowser } =
  await import('../../src/lib/magic-link.js');

describe('magic-link', () => {
  let memStore: ReturnType<typeof createMemoryStore>;
  const origIsTTY = process.stdout.isTTY;

  beforeEach(() => {
    clearEnvOverride();
    config.clear();
    config.set('environment', 'production');
    config.set('environments.production', { authMethod: 'api-key' });
    memStore = createMemoryStore();
    _setStore(memStore);
    setupMockFetch();
    spawnMock.mockClear();
    unrefMock.mockClear();
    // Simulate interactive terminal so openInBrowser fires
    Object.defineProperty(process.stdout, 'isTTY', { value: true, configurable: true });
  });

  afterEach(() => {
    teardownMockFetch();
    Object.defineProperty(process.stdout, 'isTTY', { value: origIsTTY, configurable: true });
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

  describe('openInBrowser', () => {
    it('spawns the platform-appropriate command', () => {
      openInBrowser('https://example.com');
      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [cmd, args, opts] = spawnMock.mock.calls[0] as unknown as [string, string[], Record<string, unknown>];
      // On macOS (darwin) it should use 'open'
      expect(['open', 'xdg-open', 'start']).toContain(cmd);
      expect(args).toEqual(['https://example.com']);
      expect(opts.stdio).toBe('ignore');
      expect(opts.detached).toBe(true);
      expect(unrefMock).toHaveBeenCalled();
    });

    it('no-ops in non-TTY environments', () => {
      Object.defineProperty(process.stdout, 'isTTY', { value: false, configurable: true });
      openInBrowser('https://example.com');
      expect(spawnMock).not.toHaveBeenCalled();
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

    it('auto-opens converted magic links in the browser', async () => {
      const result: Record<string, unknown> = {
        checkoutUrl: 'https://ud.me/checkout/abc',
      };
      await applyMagicLinks(result, ['checkoutUrl']);

      expect(spawnMock).toHaveBeenCalledTimes(1);
      const [, args] = spawnMock.mock.calls[0] as unknown as [string, string[]];
      expect(args[0]).toContain('token=tok');
    });

    it('does not open browser when URL is unchanged (fallback)', async () => {
      // No auth → magic link creation falls back to raw URL
      teardownMockFetch();
      setupMockFetch();
      // No route mocked → will fail and return raw URL
      const result: Record<string, unknown> = {
        checkoutUrl: 'https://ud.me/checkout/abc',
      };
      await applyMagicLinks(result, ['checkoutUrl']);

      expect(spawnMock).not.toHaveBeenCalled();
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
