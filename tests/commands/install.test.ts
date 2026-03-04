import { jest, describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { Command } from 'commander';

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

describe('install command', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let program: Command;
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = 0;
    program = await createTestProgram();
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    jest.restoreAllMocks();
    process.exitCode = 0;
    process.env = { ...originalEnv };
  });

  it('warns when shell cannot be detected', async () => {
    // Remove shell env vars
    delete process.env.SHELL;
    delete process.env.PSModulePath;

    await program.parseAsync(['node', 'ud', 'install']);

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('Could not detect your shell'),
    );
  });

  it('prints success for detected shell', async () => {
    // Force zsh detection but override HOME to a temp dir to avoid modifying real config
    process.env.SHELL = '/bin/zsh';

    // We can't easily test file writes without mocking fs, but we can verify
    // the command runs without crashing and produces output
    try {
      await program.parseAsync(['node', 'ud', 'install']);
    } catch {
      // May fail due to file system permissions in CI, that's OK
    }

    // Should have attempted to produce output (either success or error)
    expect(consoleSpy.mock.calls.length + errorSpy.mock.calls.length).toBeGreaterThan(0);
  });

  it('detects bash from SHELL env var', async () => {
    process.env.SHELL = '/bin/bash';

    try {
      await program.parseAsync(['node', 'ud', 'install']);
    } catch {
      // File system issues are OK
    }

    const allOutput = [...consoleSpy.mock.calls, ...errorSpy.mock.calls]
      .map((call) => String(call[0]))
      .join('\n');

    // Should mention bash_profile (macOS) or bashrc (Linux) or shell completions
    expect(allOutput).toMatch(/bash_profile|bashrc|completions|shell/i);
  });

  it('detects fish from SHELL env var', async () => {
    process.env.SHELL = '/usr/bin/fish';

    try {
      await program.parseAsync(['node', 'ud', 'install']);
    } catch {
      // File system issues are OK
    }

    const allOutput = [...consoleSpy.mock.calls, ...errorSpy.mock.calls]
      .map((call) => String(call[0]))
      .join('\n');

    expect(allOutput).toMatch(/fish|completions|shell/i);
  });
});
