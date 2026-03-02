import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { Environment, TokenData } from './types.js';
import { getActiveEnv } from './config.js';

interface CredentialStore {
  saveApiKey(key: string, env: Environment): Promise<void>;
  getApiKey(env: Environment): Promise<string | null>;
  saveTokens(tokens: TokenData, env: Environment): Promise<void>;
  getTokens(env: Environment): Promise<TokenData | null>;
  clear(env: Environment): Promise<void>;
}

// --- Keytar-backed store (primary) ---

class KeytarStore implements CredentialStore {
  private keytar: typeof import('keytar');

  constructor(keytar: typeof import('keytar')) {
    this.keytar = keytar;
  }

  private service(env: Environment): string {
    return `ud-cli:${env}`;
  }

  async saveApiKey(key: string, env: Environment): Promise<void> {
    await this.keytar.setPassword(this.service(env), 'api-key', key);
  }

  async getApiKey(env: Environment): Promise<string | null> {
    return this.keytar.getPassword(this.service(env), 'api-key');
  }

  async saveTokens(tokens: TokenData, env: Environment): Promise<void> {
    await this.keytar.setPassword(this.service(env), 'oauth-tokens', JSON.stringify(tokens));
  }

  async getTokens(env: Environment): Promise<TokenData | null> {
    const raw = await this.keytar.getPassword(this.service(env), 'oauth-tokens');
    if (!raw) return null;
    return JSON.parse(raw) as TokenData;
  }

  async clear(env: Environment): Promise<void> {
    await this.keytar.deletePassword(this.service(env), 'api-key').catch(() => {});
    await this.keytar.deletePassword(this.service(env), 'oauth-tokens').catch(() => {});
  }
}

// --- File-backed store (fallback) ---

class FileStore implements CredentialStore {
  private dir: string;

  constructor() {
    this.dir = path.join(os.homedir(), '.ud-cli');
  }

  private filePath(env: Environment): string {
    return path.join(this.dir, `credentials-${env}.json`);
  }

  private ensureDir(): void {
    if (!fs.existsSync(this.dir)) {
      fs.mkdirSync(this.dir, { recursive: true, mode: 0o700 });
    }
  }

  private read(env: Environment): Record<string, unknown> {
    const fp = this.filePath(env);
    if (!fs.existsSync(fp)) return {};
    const raw = fs.readFileSync(fp, 'utf-8');
    return JSON.parse(raw) as Record<string, unknown>;
  }

  private write(env: Environment, data: Record<string, unknown>): void {
    this.ensureDir();
    const fp = this.filePath(env);
    fs.writeFileSync(fp, JSON.stringify(data, null, 2), { mode: 0o600 });
  }

  async saveApiKey(key: string, env: Environment): Promise<void> {
    const data = this.read(env);
    data['api-key'] = key;
    this.write(env, data);
  }

  async getApiKey(env: Environment): Promise<string | null> {
    const data = this.read(env);
    return (data['api-key'] as string) ?? null;
  }

  async saveTokens(tokens: TokenData, env: Environment): Promise<void> {
    const data = this.read(env);
    data['oauth-tokens'] = tokens;
    this.write(env, data);
  }

  async getTokens(env: Environment): Promise<TokenData | null> {
    const data = this.read(env);
    return (data['oauth-tokens'] as TokenData) ?? null;
  }

  async clear(env: Environment): Promise<void> {
    const fp = this.filePath(env);
    if (fs.existsSync(fp)) {
      fs.unlinkSync(fp);
    }
  }
}

// --- Store singleton ---

let store: CredentialStore | undefined;

async function getStore(): Promise<CredentialStore> {
  if (store) return store;

  try {
    const keytar = await import('keytar');
    // Quick smoke-test to see if the native module actually works
    await keytar.findCredentials('ud-cli:__test__');
    store = new KeytarStore(keytar);
  } catch {
    store = new FileStore();
  }
  return store;
}

// Public convenience functions scoped to the active environment

export async function saveApiKey(key: string, env?: Environment): Promise<void> {
  const s = await getStore();
  await s.saveApiKey(key, env ?? getActiveEnv());
}

export async function getApiKey(env?: Environment): Promise<string | null> {
  const s = await getStore();
  return s.getApiKey(env ?? getActiveEnv());
}

export async function saveTokens(tokens: TokenData, env?: Environment): Promise<void> {
  const s = await getStore();
  await s.saveTokens(tokens, env ?? getActiveEnv());
}

export async function getTokens(env?: Environment): Promise<TokenData | null> {
  const s = await getStore();
  return s.getTokens(env ?? getActiveEnv());
}

export async function clearCredentials(env?: Environment): Promise<void> {
  const s = await getStore();
  await s.clear(env ?? getActiveEnv());
}

// For testing: allow injecting a custom store
export function _setStore(s: CredentialStore): void {
  store = s;
}

export type { CredentialStore };
