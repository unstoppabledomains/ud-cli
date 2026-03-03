import {
  getActiveEnv,
  getDefaultEnv,
  setDefaultEnv,
  setEnvOverride,
  clearEnvOverride,
  apiBaseUrl,
  mcpBaseUrl,
  getEnvConfig,
  setEnvConfig,
  clearEnvConfig,
  config,
} from '../../src/lib/config.js';

describe('config', () => {
  beforeEach(() => {
    clearEnvOverride();
    config.clear();
  });

  describe('getDefaultEnv / setDefaultEnv', () => {
    it('defaults to production', () => {
      expect(getDefaultEnv()).toBe('production');
    });

    it('persists a new default', () => {
      setDefaultEnv('staging');
      expect(getDefaultEnv()).toBe('staging');
    });
  });

  describe('getActiveEnv / setEnvOverride', () => {
    it('returns default when no override', () => {
      expect(getActiveEnv()).toBe('production');
    });

    it('returns override when set', () => {
      setEnvOverride('staging');
      expect(getActiveEnv()).toBe('staging');
    });

    it('clearEnvOverride restores default', () => {
      setEnvOverride('staging');
      clearEnvOverride();
      expect(getActiveEnv()).toBe('production');
    });
  });

  describe('apiBaseUrl', () => {
    it('returns production URL', () => {
      expect(apiBaseUrl('production')).toBe('https://api.unstoppabledomains.com');
    });

    it('returns sandbox URL', () => {
      expect(apiBaseUrl('sandbox')).toBe('https://api.ud-sandbox.com');
    });

    it('returns staging URL', () => {
      expect(apiBaseUrl('staging')).toBe('https://api.ud-staging.com');
    });
  });

  describe('mcpBaseUrl', () => {
    it('appends /mcp/v1', () => {
      expect(mcpBaseUrl('production')).toBe('https://api.unstoppabledomains.com/mcp/v1');
    });
  });

  describe('environment config', () => {
    it('returns empty config by default', () => {
      expect(getEnvConfig('production')).toEqual({});
    });

    it('sets and gets environment config', () => {
      setEnvConfig({ authMethod: 'api-key' }, 'production');
      expect(getEnvConfig('production')).toEqual({ authMethod: 'api-key' });
    });

    it('merges config updates', () => {
      setEnvConfig({ authMethod: 'oauth' }, 'staging');
      setEnvConfig({ oauth: { clientId: 'test-id' } }, 'staging');
      const envConfig = getEnvConfig('staging');
      expect(envConfig.authMethod).toBe('oauth');
      expect(envConfig.oauth?.clientId).toBe('test-id');
    });

    it('clears environment config', () => {
      setEnvConfig({ authMethod: 'api-key' }, 'production');
      clearEnvConfig('production');
      expect(getEnvConfig('production')).toEqual({});
    });
  });
});
