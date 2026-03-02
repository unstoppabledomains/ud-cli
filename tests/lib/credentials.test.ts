import {
  saveApiKey,
  getApiKey,
  saveTokens,
  getTokens,
  clearCredentials,
  _setStore,
} from '../../src/lib/credentials.js';
import type { CredentialStore } from '../../src/lib/credentials.js';
import type { Environment, TokenData } from '../../src/lib/types.js';

// In-memory store for tests
function createMemoryStore(): CredentialStore {
  const data = new Map<string, Map<string, string>>();

  function bucket(env: Environment): Map<string, string> {
    if (!data.has(env)) data.set(env, new Map());
    return data.get(env)!;
  }

  return {
    async saveApiKey(key: string, env: Environment) {
      bucket(env).set('api-key', key);
    },
    async getApiKey(env: Environment) {
      return bucket(env).get('api-key') ?? null;
    },
    async saveTokens(tokens: TokenData, env: Environment) {
      bucket(env).set('oauth-tokens', JSON.stringify(tokens));
    },
    async getTokens(env: Environment) {
      const raw = bucket(env).get('oauth-tokens');
      return raw ? (JSON.parse(raw) as TokenData) : null;
    },
    async clear(env: Environment) {
      data.delete(env);
    },
  };
}

describe('credentials', () => {
  let memStore: CredentialStore;

  beforeEach(() => {
    memStore = createMemoryStore();
    _setStore(memStore);
  });

  describe('API key', () => {
    it('saves and retrieves an API key', async () => {
      await saveApiKey('ud_mcp_abc123', 'production');
      expect(await getApiKey('production')).toBe('ud_mcp_abc123');
    });

    it('returns null when no key stored', async () => {
      expect(await getApiKey('production')).toBeNull();
    });

    it('stores keys per environment', async () => {
      await saveApiKey('key-prod', 'production');
      await saveApiKey('key-stg', 'staging');
      expect(await getApiKey('production')).toBe('key-prod');
      expect(await getApiKey('staging')).toBe('key-stg');
    });
  });

  describe('OAuth tokens', () => {
    const tokens: TokenData = {
      accessToken: 'access-123',
      refreshToken: 'refresh-456',
      expiresAt: Date.now() + 3600_000,
      scope: 'read write',
    };

    it('saves and retrieves tokens', async () => {
      await saveTokens(tokens, 'production');
      const retrieved = await getTokens('production');
      expect(retrieved).toEqual(tokens);
    });

    it('returns null when no tokens stored', async () => {
      expect(await getTokens('staging')).toBeNull();
    });
  });

  describe('clear', () => {
    it('removes all credentials for an environment', async () => {
      await saveApiKey('key', 'production');
      await saveTokens(
        { accessToken: 'a', refreshToken: 'r', expiresAt: 0 },
        'production',
      );
      await clearCredentials('production');
      expect(await getApiKey('production')).toBeNull();
      expect(await getTokens('production')).toBeNull();
    });

    it('does not affect other environments', async () => {
      await saveApiKey('key-prod', 'production');
      await saveApiKey('key-stg', 'staging');
      await clearCredentials('production');
      expect(await getApiKey('staging')).toBe('key-stg');
    });
  });
});
