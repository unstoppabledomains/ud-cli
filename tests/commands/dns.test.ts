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

  // --- dns records show ---

  it('dns records show passes domain positional', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_records_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ records: [{ type: 'A', subName: '', values: ['1.2.3.4'], ttl: 300 }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'dns', 'records', 'show', 'example.com']);

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
      'node', 'ud', 'domains', 'dns', 'records', 'add', 'example.com',
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
      'node', 'ud', 'domains', 'dns', 'records', 'update',
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
      'node', 'ud', 'domains', 'dns', 'records', 'remove',
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

    await program.parseAsync(['node', 'ud', 'domains', 'dns', 'records', 'remove-all', 'test.com', '--confirm']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
    expect(capturedBody!.confirmDeleteAll).toBe(true);
  });

  it('dns records remove-all aborts without --confirm in non-TTY', async () => {
    mockFetchRoute('actions/ud_dns_records_remove_all', () => {
      return jsonResponse({ results: [] });
    });

    // Non-TTY: promptConfirm returns false, so it should abort
    await program.parseAsync(['node', 'ud', 'domains', 'dns', 'records', 'remove-all', 'test.com']);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('Aborted');
  });

  // --- dns nameservers ---

  it('dns nameservers show passes domain', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_nameservers_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ domain: 'test.com', nameservers: ['ns1.test.com'], isUsingDefaultNameservers: true });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'dns', 'nameservers', 'show', 'test.com']);

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
      'node', 'ud', 'domains', 'dns', 'nameservers', 'set-custom',
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
      'node', 'ud', 'domains', 'dns', 'nameservers', 'set-default',
      '--data', '{"domains":[{"name":"test.com"}]}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toBeDefined();
  });

  // --- hosting redirects ---

  it('hosting redirects show passes domain', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_list', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ configs: [{ type: 'redirect', subName: '', targetUrl: 'https://example.com', status: 'active' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'hosting', 'redirects', 'show', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domain).toBe('test.com');
  });

  it('hosting redirects add passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_add', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'domains', 'hosting', 'redirects', 'add',
      '--data', '{"domains":[{"name":"test.com"}],"config":{"type":"redirect","targetUrl":"https://example.com"}}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.config).toBeDefined();
  });

  it('hosting redirects remove passes --data body', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_dns_hosting_remove', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync([
      'node', 'ud', 'domains', 'hosting', 'redirects', 'remove',
      '--data', '{"domains":[{"name":"test.com"}],"subName":"www"}',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.subName).toBe('www');
  });

  // --- hosting landers ---

  it('hosting landers generate passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_generate_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true, jobId: 'j123' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'hosting', 'landers', 'generate', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  it('hosting landers show passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_lander_status', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', status: 'active', hostingType: 'ai' }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'hosting', 'landers', 'show', 'test.com']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  it('hosting landers remove passes variadic domains with --confirm', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_remove_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true }] });
    });

    await program.parseAsync(['node', 'ud', 'domains', 'hosting', 'landers', 'remove', 'test.com', '--confirm']);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
  });

  it('hosting landers generate passes --instructions flag', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_generate_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({ results: [{ domain: 'test.com', success: true, jobId: 'j123' }] });
    });

    await program.parseAsync([
      'node', 'ud', 'domains', 'hosting', 'landers', 'generate', 'test.com',
      '--instructions', 'Make it professional with a blue theme',
    ]);

    expect(capturedBody).toBeTruthy();
    expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
    expect(capturedBody!.instructions).toBe('Make it professional with a blue theme');
  });

  it('hosting landers upload passes variadic domains with --html-file', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.default.tmpdir(), 'ud-test-'));
    const htmlFile = path.join(tmpDir, 'multi.html');
    fs.writeFileSync(htmlFile, '<html>multi</html>');

    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_upload_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        results: [
          { domain: 'test.com', success: true, status: 'processing' },
          { domain: 'other.com', success: true, status: 'processing' },
        ],
        successCount: 2,
        failureCount: 0,
      });
    });

    try {
      await program.parseAsync([
        'node', 'ud', 'domains', 'hosting', 'landers', 'upload', 'test.com', 'other.com',
        '--html-file', htmlFile,
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([
        { name: 'test.com', htmlContent: '<html>multi</html>' },
        { name: 'other.com', htmlContent: '<html>multi</html>' },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('hosting landers upload reads --html-file and injects content', async () => {
    // Write a temp file to read
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.default.tmpdir(), 'ud-test-'));
    const htmlFile = path.join(tmpDir, 'test.html');
    fs.writeFileSync(htmlFile, '<html><body>Test Lander</body></html>');

    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_upload_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        results: [{ domain: 'test.com', success: true, status: 'processing' }],
        successCount: 1,
        failureCount: 0,
      });
    });

    try {
      await program.parseAsync([
        'node', 'ud', 'domains', 'hosting', 'landers', 'upload', 'test.com',
        '--html-file', htmlFile,
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([
        { name: 'test.com', htmlContent: '<html><body>Test Lander</body></html>' },
      ]);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('hosting landers download passes variadic domains', async () => {
    let capturedBody: Record<string, unknown> | null = null;
    mockFetchRoute('actions/ud_domain_download_lander', (_url, init) => {
      capturedBody = JSON.parse(init?.body as string);
      return jsonResponse({
        results: [{ domain: 'test.com', success: true, format: 'html', htmlContent: '<html>test</html>' }],
        successCount: 1,
        failureCount: 0,
      });
    });

    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.default.tmpdir(), 'ud-test-'));

    try {
      await program.parseAsync([
        'node', 'ud', 'domains', 'hosting', 'landers', 'download', 'test.com',
        '--output-dir', tmpDir,
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);

      // Verify file was written
      const filePath = path.join(tmpDir, 'test.com.html');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath, 'utf-8')).toBe('<html>test</html>');
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
  });

  it('hosting landers download saves zip content as binary', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const os = await import('node:os');
    const tmpDir = fs.mkdtempSync(path.join(os.default.tmpdir(), 'ud-test-'));

    // Create a simple base64 content (not a real zip, but enough to test decoding)
    const originalContent = 'fake zip content for testing';
    const base64Content = Buffer.from(originalContent).toString('base64');

    mockFetchRoute('actions/ud_domain_download_lander', () => {
      return jsonResponse({
        results: [{ domain: 'test.com', success: true, format: 'zip', zipContent: base64Content }],
        successCount: 1,
        failureCount: 0,
      });
    });

    try {
      await program.parseAsync([
        'node', 'ud', 'domains', 'hosting', 'landers', 'download', 'test.com',
        '--output-dir', tmpDir,
      ]);

      const filePath = path.join(tmpDir, 'test.com.zip');
      expect(fs.existsSync(filePath)).toBe(true);
      expect(fs.readFileSync(filePath).toString()).toBe(originalContent);
    } finally {
      fs.rmSync(tmpDir, { recursive: true });
    }
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
      'node', 'ud', 'domains', 'dns', 'records', 'add', 'test.com',
      '--type', 'A', '--values', '1.2.3.4',
    ]);

    const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
    expect(output).toContain('DNS changes are async');
    expect(output).toContain('ud domains operations show');
  });
});
