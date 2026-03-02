import Conf from 'conf';
import type { AppConfig, Environment, EnvironmentConfig } from './types.js';

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
};

const config = new Conf<AppConfig>({
  projectName: 'ud-cli',
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

export { config };
