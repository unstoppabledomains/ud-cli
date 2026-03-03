import { jest } from '@jest/globals';
import { Command } from 'commander';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { createMemoryStore } from '../helpers/memoryStore.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';

async function createTestProgram() {
  jest.resetModules();
  const { program } = await import('../../src/program.js');
  // Prevent Commander from calling process.exit on argument errors (kills Jest worker).
  // Must be applied recursively — exitOverride only affects the command it's called on.
  function applyExitOverride(cmd: Command) {
    cmd.exitOverride();
    for (const sub of cmd.commands) applyExitOverride(sub);
  }
  applyExitOverride(program);
  return program;
}

describe('domain commands', () => {
  let memStore: ReturnType<typeof createMemoryStore>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let program: Command;

  beforeEach(async () => {
    clearEnvOverride();
    config.clear();
    config.set('environment', 'production');
    config.set('environments.production', { authMethod: 'api-key' });
    memStore = createMemoryStore();
    _setStore(memStore);
    await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');
    setupMockFetch();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
    program = await createTestProgram();
  });

  afterEach(() => {
    teardownMockFetch();
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  // --- search (root-level) ---

  it('search passes query and --tlds', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domains_search', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [], pagination: { total: 0, hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'search', 'example', '--tlds', 'com,org']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.query).toBe('example');
    expect(capturedBody!.tlds).toEqual(['com', 'org']);
  });

  it('search passes --limit', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domains_search', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [], pagination: { total: 0, hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'search', 'test', '--limit', '10']);

    expect(capturedBody!.limit).toBe(10);
  });

  // --- tlds (root-level) ---

  it('tlds calls ud_tld_list', async () => {
    let called = false;
    mockFetchRoute('actions/ud_tld_list', () => {
      called = true;
      return jsonResponse({ tlds: [{ tld: 'com' }, { tld: 'xyz' }] });
    });

    await program.parseAsync(['node', 'ud', 'tlds']);
    expect(called).toBe(true);
  });

  // --- domains list ---

  it('domains list passes --page flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_portfolio_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domains: [], pagination: { hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'list', '--page', '2']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.page).toBe(2);
  });

  it('domains list passes --status flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_portfolio_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domains: [], pagination: { hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'list', '--status', 'active']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.status).toBe('active');
  });

  it('domains list passes --order-by flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_portfolio_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domains: [], pagination: { hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'list', '--order-by', 'name']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.orderBy).toBe('name');
  });

  // --- domains get ---

  it('domains get passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_get', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domains: [{ domain: 'a.com' }, { domain: 'b.com' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'get', 'a.com', 'b.com']);

    expect(capturedBody).toBeTruthy();
    // ud_domain_get spec: domains is string[] (not objects)
    expect(capturedBody!.domains).toEqual(['a.com', 'b.com']);
  });

  // --- domains operations ---

  it('domains operations passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_pending_operations', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', hasPendingOperations: false }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'operations', 'test.com']);

    expect(capturedBody).toBeTruthy();
    // ud_domain_pending_operations spec: domains is object[] with {name}
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  // --- domains auto-renewal update ---

  it('domains auto-renewal update passes --action flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_auto_renewal_update', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'auto-renewal', 'update', 'test.com', '--action', 'enable']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.action).toBe('enable');
    // ud_domain_auto_renewal_update spec: domains is object[] with {name}
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  // --- domains tags add/remove ---

  it('domains tags add passes domains and --tags', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_tags_add', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true, tagsApplied: ['web3'] }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'tags', 'add', 'test.com', '--tags', 'web3,nft']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.tags).toEqual(['web3', 'nft']);
  });

  it('domains tags remove passes domains and --tags', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_tags_remove', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true, tagsRemoved: ['web3'] }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'tags', 'remove', 'test.com', '--tags', 'web3']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.tags).toEqual(['web3']);
  });

  // --- domains flags update ---

  it('domains flags update passes domains and --flags via --data', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_flags_update', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'domains', 'flags', 'update', 'test.com',
      '--data', '{"domains":["test.com"],"flags":{"whoisPrivacy":true}}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.flags).toEqual({ whoisPrivacy: true });
  });

  // --- domains push ---

  it('domains push passes domains and --otp-code', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_push', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ success: true, message: 'Push initiated' });
    });

    await program.parseAsync([
      'node', 'ud', 'domains', 'push', 'test.com',
      '--target-account-id', 'brave-tiger-k7m',
      '--otp-code', '123456',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.otpCode).toBe('123456');
    expect(capturedBody!.targetAccountId).toBe('brave-tiger-k7m');
  });

});
