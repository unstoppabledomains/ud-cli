import { jest } from '@jest/globals';
import { program } from '../../src/program.js';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';
import { createMemoryStore } from '../helpers/memoryStore.js';

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

  describe('status', () => {
    it('shows not authenticated when no credentials', async () => {
      await program.parseAsync(['node', 'ud', 'auth', 'status']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Not authenticated'),
      );
    });

    it('shows authenticated with valid key', async () => {
      const validKey = 'ud_mcp_' + 'a'.repeat(64);
      await memStore.saveApiKey(validKey, 'production');
      config.set('environments.production', { authMethod: 'api-key' });

      mockFetchRoute('actions/ud_portfolio_list', () => jsonResponse({ domains: [] }));

      await program.parseAsync(['node', 'ud', 'auth', 'status']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Authenticated via api-key'),
      );
    });
  });
});
