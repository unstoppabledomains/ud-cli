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

describe('completion command', () => {
  let stdoutSpy: ReturnType<typeof jest.spyOn>;
  let stderrSpy: ReturnType<typeof jest.spyOn>;
  let program: Command;

  beforeEach(async () => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    stderrSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = 0;
    program = await createTestProgram();
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    stderrSpy.mockRestore();
    jest.restoreAllMocks();
    process.exitCode = 0;
  });

  // --- Basic output for each shell ---

  it('outputs bash completion script', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'bash']);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    expect(output).toContain('_ud_completions');
    expect(output).toContain('complete -o default -F _ud_completions ud');
  });

  it('outputs zsh completion script', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'zsh']);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    expect(output).toContain('#compdef ud');
    expect(output).toContain('compdef _ud ud');
  });

  it('outputs fish completion script', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'fish']);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    expect(output).toContain('complete -c ud -f');
    expect(output).toContain('__ud_using_command');
  });

  it('outputs powershell completion script', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'powershell']);

    expect(stdoutSpy).toHaveBeenCalled();
    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    expect(output).toContain('Register-ArgumentCompleter');
    expect(output).toContain('-CommandName ud');
  });

  // --- Contains expected commands ---

  it('includes all top-level command groups', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'bash']);

    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    for (const cmd of ['auth', 'domains', 'cart', 'search', 'marketplace', 'completion', 'install']) {
      expect(output).toContain(cmd);
    }
  });

  it('includes deeply nested commands', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'bash']);

    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    // domains → dns → records → add (4 levels deep)
    expect(output).toContain('domains__dns__records__add');
    expect(output).toContain('domains__dns__nameservers');
  });

  it('includes global options in every command', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'bash']);

    const output = (stdoutSpy.mock.calls[0] as [string])[0];
    // Global flags should appear in the auth subcommand completion
    expect(output).toContain('"auth"');
    // Extract the auth case and verify it has global flags
    const authMatch = output.match(/"auth"\)\s*\n\s*COMPREPLY=\(\$\(compgen -W "([^"]+)"/);
    expect(authMatch).not.toBeNull();
    const authWords = authMatch![1];
    expect(authWords).toContain('--env');
    expect(authWords).toContain('--format');
  });

  // --- Error cases ---

  it('sets exitCode 1 for unsupported shell', async () => {
    await program.parseAsync(['node', 'ud', 'completion', '-s', 'tcsh']);

    expect(process.exitCode).toBe(1);
    expect(stderrSpy).toHaveBeenCalledWith(expect.stringContaining('Unsupported shell'));
  });

  it('errors when --shell is missing', async () => {
    await expect(
      program.parseAsync(['node', 'ud', 'completion']),
    ).rejects.toThrow();
  });
});
