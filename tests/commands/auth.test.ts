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

describe('signup', () => {
  let memStore: ReturnType<typeof createMemoryStore>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  // Mock prompt functions
  let promptInputMock: jest.Mock<(...args: unknown[]) => Promise<string>>;
  let promptPasswordMock: jest.Mock<(...args: unknown[]) => Promise<string>>;

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

    promptInputMock = jest.fn<(...args: unknown[]) => Promise<string>>();
    promptPasswordMock = jest.fn<(...args: unknown[]) => Promise<string>>();
  });

  afterEach(() => {
    teardownMockFetch();
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
    jest.restoreAllMocks();
  });

  async function createSignupProgram() {
    // Reset module registry so the mock takes effect on fresh imports
    jest.resetModules();

    jest.unstable_mockModule('../../src/lib/prompt.js', () => ({
      promptInput: promptInputMock,
      promptPassword: promptPasswordMock,
      promptConfirm: jest.fn<() => Promise<boolean>>().mockResolvedValue(false),
    }));

    // Re-inject the memory store into the fresh credentials module
    const { _setStore: freshSetStore } = await import('../../src/lib/credentials.js');
    freshSetStore(memStore);

    // Re-import to pick up the mocked prompt module
    const { registerAuthCommands } = await import('../../src/commands/auth.js');
    const { Command } = await import('commander');
    const prog = new Command();
    prog.exitOverride();
    registerAuthCommands(prog);
    return prog;
  }

  function mockStdinTTY(isTTY: boolean) {
    Object.defineProperty(process.stdin, 'isTTY', { value: isTTY, configurable: true });
  }

  it('completes signup happy path', async () => {
    mockStdinTTY(true);

    promptInputMock
      .mockResolvedValueOnce('user@example.com')   // email
      .mockResolvedValueOnce('AB12CD');             // verification code

    promptPasswordMock
      .mockResolvedValueOnce('SecurePass1!')        // password
      .mockResolvedValueOnce('SecurePass1!');        // confirm

    mockFetchRoute('api/oauth/signup/verify', () =>
      jsonResponse({
        access_token: 'at_123',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'rt_456',
        scope: 'domains:search portfolio:read',
      }),
    );

    mockFetchRoute('api/oauth/signup', () =>
      jsonResponse({
        signup_session_token: 'session_abc',
        expires_in: 900,
      }),
    );

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    const tokens = await memStore.getTokens('production');
    expect(tokens).not.toBeNull();
    expect(tokens!.accessToken).toBe('at_123');
    expect(tokens!.refreshToken).toBe('rt_456');
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Account created and logged in'),
    );
  });

  it('rejects invalid email', async () => {
    mockStdinTTY(true);

    // promptInput returns empty string after validation failures (3 retries exhausted)
    promptInputMock.mockResolvedValueOnce('');

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('valid email'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects weak password', async () => {
    mockStdinTTY(true);

    promptInputMock.mockResolvedValueOnce('user@example.com');
    promptPasswordMock.mockResolvedValueOnce('weak');

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Password does not meet requirements'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('rejects password mismatch', async () => {
    mockStdinTTY(true);

    promptInputMock.mockResolvedValueOnce('user@example.com');
    promptPasswordMock
      .mockResolvedValueOnce('SecurePass1!')
      .mockResolvedValueOnce('DifferentPass2@');

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Passwords do not match'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles signup API error', async () => {
    mockStdinTTY(true);

    promptInputMock.mockResolvedValueOnce('user@example.com');
    promptPasswordMock
      .mockResolvedValueOnce('SecurePass1!')
      .mockResolvedValueOnce('SecurePass1!');

    mockFetchRoute('api/oauth/signup', () =>
      jsonResponse(
        { error: 'invalid_request', error_description: 'Disposable email addresses are not allowed' },
        400,
      ),
    );

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Disposable email'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('handles verify API error', async () => {
    mockStdinTTY(true);

    promptInputMock
      .mockResolvedValueOnce('user@example.com')
      .mockResolvedValueOnce('WRONG1');

    promptPasswordMock
      .mockResolvedValueOnce('SecurePass1!')
      .mockResolvedValueOnce('SecurePass1!');

    // Register /verify first — both patterns contain 'api/oauth/signup'
    mockFetchRoute('api/oauth/signup/verify', () =>
      jsonResponse(
        { error: 'invalid_grant', error_description: 'Invalid verification code' },
        400,
      ),
    );

    mockFetchRoute('api/oauth/signup', (url) =>
      url.includes('/verify')
        ? new Response('', { status: 404 })
        : jsonResponse({ signup_session_token: 'session_abc', expires_in: 900 }),
    );

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid verification code'),
    );
    expect(process.exitCode).toBe(1);
  });

  it('exits early in non-TTY', async () => {
    mockStdinTTY(false);

    const prog = await createSignupProgram();
    await prog.parseAsync(['node', 'ud', 'auth', 'signup']);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('interactive terminal'),
    );
    expect(process.exitCode).toBe(1);
  });
});
