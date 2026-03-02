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

describe('dns commands', () => {
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

  // --- dns records list ---

  it('dns records list passes domain positional', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_records_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ records: [{ type: 'A', subName: '', values: ['1.2.3.4'], ttl: 300 }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'records', 'list', 'example.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domain).toBe('example.com');
  });

  // --- dns records add ---

  it('dns records add passes domain and shorthand flags', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_record_add', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'example.com', success: true, operationId: 'op1' }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'records', 'add', 'example.com',
      '--type', 'A', '--values', '1.2.3.4',
    ]);

    expect(capturedBody).toBeTruthy();
    // Shorthand creates array-of-objects with domain from positional
    expect(capturedBody!.records).toBeDefined();
    const records = capturedBody!.records as Record<string, unknown>[];
    expect(records[0].domain).toBe('example.com');
    expect(records[0].type).toBe('A');
  });

  // --- dns records update ---

  it('dns records update passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_record_update', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'records', 'update',
      '--data', '{"records":[{"domain":"test.com","type":"A","values":["5.6.7.8"]}]}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.records).toBeDefined();
  });

  // --- dns records remove ---

  it('dns records remove passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_record_remove', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'records', 'remove',
      '--data', '{"records":[{"domain":"test.com","type":"A"}]}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.records).toBeDefined();
  });

  // --- dns records remove-all ---

  it('dns records remove-all passes domain with --confirm', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_records_remove_all', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'records', 'remove-all', 'test.com', '--confirm']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
    expect(capturedBody!.confirmDeleteAll).toBe(true);
  });

  it('dns records remove-all aborts without --confirm in non-TTY', async () => {
    mockFetchRoute('actions/ud_dns_records_remove_all', () => {
      return jsonResponse({ results: [] });
    });

    // Non-TTY: promptConfirm returns false, so it should abort
    await program.parseAsync(['node', 'ud', 'dns', 'records', 'remove-all', 'test.com']);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Aborted');
  });

  // --- dns nameservers ---

  it('dns nameservers list passes domain', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_nameservers_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domain: 'test.com', nameservers: ['ns1.test.com'], isUsingDefaultNameservers: true });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'nameservers', 'list', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domain).toBe('test.com');
  });

  it('dns nameservers set-custom passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_nameservers_set_custom', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'nameservers', 'set-custom',
      '--data', '{"domains":[{"name":"test.com"}],"nameservers":["ns1.custom.com","ns2.custom.com"]}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.nameservers).toEqual(['ns1.custom.com', 'ns2.custom.com']);
  });

  it('dns nameservers set-default passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_nameservers_set_default', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'nameservers', 'set-default',
      '--data', '{"domains":[{"name":"test.com"}]}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toBeDefined();
  });

  // --- dns hosting ---

  it('dns hosting list passes domain', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ configs: [{ type: 'redirect', subName: '', targetUrl: 'https://example.com', status: 'active' }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'hosting', 'list', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domain).toBe('test.com');
  });

  it('dns hosting add passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_add', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'hosting', 'add',
      '--data', '{"domains":[{"name":"test.com"}],"config":{"type":"redirect","targetUrl":"https://example.com"}}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.config).toBeDefined();
  });

  it('dns hosting remove passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_remove', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'hosting', 'remove',
      '--data', '{"domains":[{"name":"test.com"}],"subName":"www"}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.subName).toBe('www');
  });

  // --- dns hosting lander ---

  it('dns hosting lander generate passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_generate_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true, jobId: 'j123' }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'hosting', 'lander', 'generate', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  it('dns hosting lander status passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_lander_status', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', status: 'active', hostingType: 'ai' }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'hosting', 'lander', 'status', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  it('dns hosting lander remove passes variadic domains with --confirm', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_remove_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync(['node', 'ud', 'dns', 'hosting', 'lander', 'remove', 'test.com', '--confirm']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  // --- operation hint display ---

  it('shows operation hint after dns record add', async () => {
    mockFetchRoute('actions/ud_dns_record_add', () => {
      return jsonResponse({
        results: [{ domain: 'test.com', success: true, operationId: 'op-123' }],
        successCount: 1,
        failureCount: 0,
      });
    });

    await program.parseAsync([
      'node', 'ud', 'dns', 'records', 'add', 'test.com',
      '--type', 'A', '--values', '1.2.3.4',
    ]);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('DNS changes are async');
    expect(output).toContain('ud domains operations');
  });
});
