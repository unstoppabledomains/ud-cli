import Conf from 'conf';
import type { AppConfig, CommandDefaults, Environment, EnvironmentConfig } from './types.js';

const BASE_URLS: Record<Environment, string> = {
  production: 'https://api.unstoppabledomains.com',
  staging: 'https://api.ud-staging.com',
};

const schema = {
  environment: {
    type: 'string' as const,
    default: 'production',
    enum: ['production', 'staging'],
  },
  environments: {
    type: 'object' as const,
    default: {
      production: {},
      staging: {},
    },
  },
  defaults: {
    type: 'object' as const,
    default: {},
  },
  lastUpdateCheck: {
    type: 'number' as const,
    default: 0,
  },
};

const config = new Conf<AppConfig>({
  projectName: process.env.NODE_ENV === 'test' ? 'ud-cli-test' : 'ud-cli',
  schema,
});

// Stash for the --env override so library code can read it
let envOverride: Environment | undefined;

export function setEnvOverride(env: Environment): void {
  envOverride = env;
}

export function clearEnvOverride(): void {
  envOverride = undefined;
}

export function getActiveEnv(): Environment {
  return envOverride ?? (config.get('environment') as Environment);
}

export function getDefaultEnv(): Environment {
  return config.get('environment') as Environment;
}

export function setDefaultEnv(env: Environment): void {
  config.set('environment', env);
}

export function apiBaseUrl(env?: Environment): string {
  return BASE_URLS[env ?? getActiveEnv()];
}

export function mcpBaseUrl(env?: Environment): string {
  return `${apiBaseUrl(env)}/mcp/v1`;
}

export function getEnvConfig(env?: Environment): EnvironmentConfig {
  const e = env ?? getActiveEnv();
  return (config.get(`environments.${e}`) as EnvironmentConfig) ?? {};
}

export function setEnvConfig(envConfig: Partial<EnvironmentConfig>, env?: Environment): void {
  const e = env ?? getActiveEnv();
  const current = getEnvConfig(e);
  config.set(`environments.${e}`, { ...current, ...envConfig });
}

export function clearEnvConfig(env?: Environment): void {
  const e = env ?? getActiveEnv();
  config.set(`environments.${e}`, {});
}

// --- Per-command defaults ---
// Note: Always read/write the entire `defaults` object to avoid conf's
// dot-prop interpretation turning "domains.list" into nested { domains: { list: ... } }.

export function getAllDefaults(): Record<string, CommandDefaults> {
  return (config.get('defaults') as Record<string, CommandDefaults>) ?? {};
}

export function getCommandDefaults(commandPath: string): CommandDefaults {
  return getAllDefaults()[commandPath] ?? {};
}

export function setCommandDefault(commandPath: string, key: keyof CommandDefaults, value: string | boolean): void {
  const all = getAllDefaults();
  all[commandPath] = { ...all[commandPath], [key]: value };
  config.set('defaults', all);
}

export function clearCommandDefault(commandPath: string, key?: keyof CommandDefaults): void {
  const all = getAllDefaults();
  if (key) {
    const current = all[commandPath];
    if (current) {
      delete current[key];
      if (Object.keys(current).length === 0) {
        delete all[commandPath];
      }
    }
  } else {
    delete all[commandPath];
  }
  config.set('defaults', all);
}

export { config };
