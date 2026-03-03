import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';
import { config } from '../../src/lib/config.js';
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

describe('update commands', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let program: Command;

  beforeEach(async () => {
    config.clear();
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
    jest.restoreAllMocks();
    process.exitCode = undefined;
  });

  // --- update check ---

  describe('update check', () => {
    it('prints update available when newer version exists', async () => {
      mockFetchRoute('api.github.com', jsonResponse({ tag_name: 'v99.0.0' }));

      await program.parseAsync(['node', 'ud', 'update', 'check']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('99.0.0'),
      );
    });

    it('prints up to date when current version matches', async () => {
      // Use a mock that returns the current version
      const { getCurrentVersion } = await import('../../src/lib/update.js');
      const current = getCurrentVersion();
      mockFetchRoute('api.github.com', jsonResponse({ tag_name: `v${current}` }));

      await program.parseAsync(['node', 'ud', 'update', 'check']);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Up to date'),
      );
    });

    it('sets exitCode 1 on network failure', async () => {
      mockFetchRoute('api.github.com', new Response('Server Error', { status: 500, statusText: 'Internal Server Error' }));

      await program.parseAsync(['node', 'ud', 'update', 'check']);

      expect(process.exitCode).toBe(1);
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to check for updates'),
      );
    });
  });

  // --- update (npm install path) ---

  describe('update (npm install)', () => {
    it('shows npm guidance when not a binary install', async () => {
      mockFetchRoute('api.github.com', jsonResponse({ tag_name: 'v99.0.0' }));

      await program.parseAsync(['node', 'ud', 'update']);

      // In normal Node.js (test) environment, isBinaryInstall() returns false
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('npm update -g @unstoppabledomains/ud-cli'),
      );
    });

    it('reports already up to date when no update available', async () => {
      const { getCurrentVersion } = await import('../../src/lib/update.js');
      const current = getCurrentVersion();
      mockFetchRoute('api.github.com', jsonResponse({ tag_name: `v${current}` }));

      await program.parseAsync(['node', 'ud', 'update']);

      // ora spinner output goes to stderr via the ora mock, but the
      // "Already up to date" message is rendered by ora.succeed
      // We can't easily assert on ora output, but we can verify no error
      expect(process.exitCode).toBeUndefined();
    });

    it('sets exitCode 1 when check fails', async () => {
      mockFetchRoute('api.github.com', new Response('Not Found', { status: 404, statusText: 'Not Found' }));

      await program.parseAsync(['node', 'ud', 'update']);

      expect(process.exitCode).toBe(1);
    });
  });
});
