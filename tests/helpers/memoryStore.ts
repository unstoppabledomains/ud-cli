import type { CredentialStore } from '../../src/lib/credentials.js';
import type { TokenData, Environment } from '../../src/lib/types.js';

export function createMemoryStore(): CredentialStore & { data: Map<string, Map<string, string>> } {
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
