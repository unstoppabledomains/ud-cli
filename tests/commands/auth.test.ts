import { jest } from '@jest/globals';
import { program } from '../../src/program.js';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import type { CredentialStore } from '../../src/lib/credentials.js';
import type { TokenData, Environment } from '../../src/lib/types.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';

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

describe('auth commands', () => {
  let memStore: ReturnType<typeof createMemoryStore>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    clearEnvOverride();
    config.clear();
    config.set('environment', 'production');
    memStore = createMemoryStore();
    _setStore(memStore);
    setupMockFetch();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    teardownMockFetch();
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  describe('login --method api-key', () => {
    it('saves a valid API key', async () => {
      const validKey = 'ud_mcp_' + 'a'.repeat(64);
      mockFetchRoute('actions/ud_portfolio_list', () => jsonResponse({ domains: [] }));

      await program.parseAsync(['node', 'ud', 'auth', 'login', '-k', validKey]);

      expect(await memStore.getApiKey('production')).toBe(validKey);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API key saved and verified'),
      );
    });

    it('rejects an invalid API key format', async () => {
      await program.parseAsync(['node', 'ud', 'auth', 'login', '-k', 'bad-key']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Invalid API key format'),
      );
      expect(process.exitCode).toBe(1);
    });

    it('errors when no key provided', async () => {
      await program.parseAsync(['node', 'ud', 'auth', 'login', '-m', 'api-key']);

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('API key is required'),
      );
      expect(process.exitCode).toBe(1);
    });
  });

  describe('logout', () => {
    it('clears credentials', async () => {
      await memStore.saveApiKey('ud_mcp_' + 'f'.repeat(64), 'production');

      await program.parseAsync(['node', 'ud', 'auth', 'logout']);

      expect(await memStore.getApiKey('production')).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Logged out'),
      );
    });
  });

  describe('whoami', () => {
    it('shows not authenticated when no credentials', async () => {
      await program.parseAsync(['node', 'ud', 'auth', 'whoami']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not authenticated'),
      );
    });

    it('shows authenticated with valid key', async () => {
      const validKey = 'ud_mcp_' + 'a'.repeat(64);
      await memStore.saveApiKey(validKey, 'production');
      config.set('environments.production', { authMethod: 'api-key' });

      mockFetchRoute('actions/ud_portfolio_list', () => jsonResponse({ domains: [] }));

      await program.parseAsync(['node', 'ud', 'auth', 'whoami']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authenticated via api-key'),
      );
    });
  });
});
