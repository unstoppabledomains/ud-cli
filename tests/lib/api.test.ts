import { callAction, healthCheck, verifyAuth } from '../../src/lib/api.js';
import { setEnvConfig, clearEnvOverride, config } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import type { CredentialStore } from '../../src/lib/credentials.js';
import type { TokenData, Environment } from '../../src/lib/types.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse, textResponse } from '../helpers/mockFetch.js';

// In-memory credential store for tests
function createMemoryStore(): CredentialStore & { data: Map<string, Map<string, string>> } {
  const data = new Map<string, Map<string, string>>();
  function bucket(env: Environment): Map<string, string> {
    if (!data.has(env)) data.set(env, new Map());
    return data.get(env)!;
  }
  return {
    data,
    async saveApiKey(key: string, env: Environment) { bucket(env).set('api-key', key); },
    async getApiKey(env: Environment) { return bucket(env).get('api-key') ?? null; },
    async saveTokens(tokens: TokenData, env: Environment) { bucket(env).set('oauth-tokens', JSON.stringify(tokens)); },
    async getTokens(env: Environment) {
      const raw = bucket(env).get('oauth-tokens');
      return raw ? JSON.parse(raw) as TokenData : null;
    },
    async clear(env: Environment) { data.delete(env); },
  };
}

describe('api', () => {
  let memStore: ReturnType<typeof createMemoryStore>;

  beforeEach(() => {
    clearEnvOverride();
    config.clear();
    memStore = createMemoryStore();
    _setStore(memStore);
    setupMockFetch();
  });

  afterEach(() => {
    teardownMockFetch();
  });

  describe('callAction', () => {
    it('sends Bearer token from API key', async () => {
      const apiKey = 'ud_mcp_' + 'a'.repeat(64);
      await memStore.saveApiKey(apiKey, 'production');
      setEnvConfig({ authMethod: 'api-key' }, 'production');

      let capturedAuth = '';
      mockFetchRoute('actions/ud_portfolio_list', (_url, init) => {
        capturedAuth = (init?.headers as Record<string, string>)?.['Authorization'] ?? '';
        return jsonResponse({ domains: [] });
      });

      await callAction('ud_portfolio_list', { limit: 10 });
      expect(capturedAuth).toBe(`Bearer ${apiKey}`);
    });

    it('throws ApiError on 401', async () => {
      const apiKey = 'ud_mcp_' + 'b'.repeat(64);
      await memStore.saveApiKey(apiKey, 'production');
      setEnvConfig({ authMethod: 'api-key' }, 'production');

      mockFetchRoute('actions/ud_domains_search', () =>
        jsonResponse({ error: 'Unauthorized' }, 401),
      );

      await expect(callAction('ud_domains_search', {})).rejects.toThrow('Authentication failed');
    });

    it('throws ApiError on 400 with message', async () => {
      const apiKey = 'ud_mcp_' + 'c'.repeat(64);
      await memStore.saveApiKey(apiKey, 'production');
      setEnvConfig({ authMethod: 'api-key' }, 'production');

      mockFetchRoute('actions/ud_dns_record_add', () =>
        jsonResponse({ message: 'Invalid domain' }, 400),
      );

      await expect(callAction('ud_dns_record_add', {})).rejects.toThrow('Bad request: Invalid domain');
    });
  });

  describe('healthCheck', () => {
    it('returns true when API is healthy', async () => {
      mockFetchRoute('/health', () => jsonResponse({ status: 'ok' }));
      expect(await healthCheck()).toBe(true);
    });

    it('returns false on error', async () => {
      mockFetchRoute('/health', () => textResponse('Service Unavailable', 503));
      expect(await healthCheck()).toBe(false);
    });
  });

  describe('verifyAuth', () => {
    it('returns not authenticated when no credentials', async () => {
      const status = await verifyAuth();
      expect(status.authenticated).toBe(false);
      expect(status.message).toContain('Not authenticated');
    });

    it('returns authenticated with valid API key', async () => {
      const apiKey = 'ud_mcp_' + 'd'.repeat(64);
      await memStore.saveApiKey(apiKey, 'production');
      setEnvConfig({ authMethod: 'api-key' }, 'production');

      mockFetchRoute('actions/ud_portfolio_list', () => jsonResponse({ domains: [] }));

      const status = await verifyAuth();
      expect(status.authenticated).toBe(true);
      expect(status.method).toBe('api-key');
      expect(status.environment).toBe('production');
    });

    it('returns not authenticated on 401', async () => {
      const apiKey = 'ud_mcp_' + 'e'.repeat(64);
      await memStore.saveApiKey(apiKey, 'production');
      setEnvConfig({ authMethod: 'api-key' }, 'production');

      mockFetchRoute('actions/ud_portfolio_list', () =>
        jsonResponse({ error: 'Unauthorized' }, 401),
      );

      const status = await verifyAuth();
      expect(status.authenticated).toBe(false);
    });
  });
});
