import { jest } from '@jest/globals';
import { Command } from 'commander';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { createMemoryStore } from '../helpers/memoryStore.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';

async function createTestProgram() {
  jest.resetModules();
  const { program } = await import('../../src/program.js');
  function applyExitOverride(cmd: Command) {
    cmd.exitOverride();
    for (const sub of cmd.commands) applyExitOverride(sub);
  }
  applyExitOverride(program);
  return program;
}

describe('api-commands integration', () => {
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

  it('domains search calls callAction with query', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domains_search', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        results: [{ name: 'test.com', available: true }],
        pagination: { total: 1, hasMore: false },
      });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'search', 'test']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.query).toBe('test');
  });

  it('domains search passes --limit flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domains_search', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        results: [],
        pagination: { total: 0, hasMore: false },
      });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'search', 'test', '--limit', '5']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.limit).toBe(5);
  });

  it('domains search passes --tlds as comma-separated array', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domains_search', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [], pagination: { total: 0, hasMore: false } });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'search', 'test', '--tlds', 'com,org']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.tlds).toEqual(['com', 'org']);
  });

  it('domains tlds calls ud_tld_list', async () => {
    let called = false;
    mockFetchRoute('actions/ud_tld_list', () => {
      called = true;
      return jsonResponse({ tlds: [{ tld: 'com' }, { tld: 'org' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'tlds']);

    expect(called).toBe(true);
  });

  it('domains get passes variadic domains as string array', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_get', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domains: [{ name: 'a.com' }, { name: 'b.com' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'get', 'a.com', 'b.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual(['a.com', 'b.com']);
  });

  it('--format json outputs JSON', async () => {
    mockFetchRoute('actions/ud_tld_list', () => {
      return jsonResponse({ tlds: [{ tld: 'com' }] });
    });

    await program.parseAsync(['node', 'ud', '--format', 'json', 'domains', 'tlds']);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    // Should be valid JSON
    const parsed = JSON.parse(output);
    expect(parsed.tlds).toBeDefined();
  });

  it('--format csv outputs CSV', async () => {
    mockFetchRoute('actions/ud_tld_list', () => {
      return jsonResponse({ tlds: [{ tld: 'com', type: 'generic' }] });
    });

    await program.parseAsync(['node', 'ud', '--format', 'csv', 'domains', 'tlds']);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Tld');
    expect(output).toContain('com');
  });

  it('handles API errors gracefully', async () => {
    mockFetchRoute('actions/ud_domains_search', () => {
      return new Response(JSON.stringify({ message: 'Invalid query' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'search', 'test']);

    expect(process.exitCode).toBe(1);
    expect(errorSpy).toHaveBeenCalled();
  });

  it('cart get calls ud_cart_get', async () => {
    let called = false;
    mockFetchRoute('actions/ud_cart_get', () => {
      called = true;
      return jsonResponse({ items: [], total: 0 });
    });

    await program.parseAsync(['node', 'ud', 'cart', 'get']);
    expect(called).toBe(true);
  });

  it('--data flag sends raw JSON body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_contacts_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ contacts: [] });
    });

    await program.parseAsync([
      'node', 'ud', 'contacts', 'list', '--data', '{"includeDisabled":true}',
    ]);

    expect(capturedBody).toEqual({ includeDisabled: true });
  });

  it('dns records list passes domain positional', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_records_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ records: [] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'records', 'list', 'example.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domain).toBe('example.com');
  });
});
