import { Command } from 'commander';
import { mkdir, readFile, writeFile, access, cp } from 'node:fs/promises';
import { homedir, platform } from 'node:os';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chalk from 'chalk';
import { generateCompletion } from '../lib/completion.js';
import type { Shell } from '../lib/completion.js';

// In esbuild CJS bundle, __dirname is available.
// In ESM (tsc output, tsx dev), we use import.meta.url.
declare const __dirname: string | undefined;

// ---------------------------------------------------------------------------
// Shell detection
// ---------------------------------------------------------------------------

function detectShell(): Shell | null {
  const shell = process.env.SHELL ?? '';
  if (shell.endsWith('/zsh')) return 'zsh';
  if (shell.endsWith('/bash')) return 'bash';
  if (shell.endsWith('/fish')) return 'fish';
  // PowerShell doesn't set $SHELL — check PSModulePath as a heuristic
  if (process.env.PSModulePath) return 'powershell';
  return null;
}

// ---------------------------------------------------------------------------
// Completion installers (per-shell)
// ---------------------------------------------------------------------------

const COMPLETION_MARKER = '# ud-cli shell completion';

async function fileContains(filePath: string, marker: string): Promise<boolean> {
  try {
    const content = await readFile(filePath, 'utf-8');
    return content.includes(marker);
  } catch {
    return false;
  }
}

async function appendToFile(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await mkdir(dir, { recursive: true });
  try {
    const existing = await readFile(filePath, 'utf-8');
    const separator = existing.endsWith('\n') ? '' : '\n';
    await writeFile(filePath, existing + separator + content + '\n');
  } catch {
    // File doesn't exist — create it
    await writeFile(filePath, content + '\n');
  }
}

interface InstallResult {
  message: string;
  /** Shell command the user can run to activate completions in the current session. */
  activateHint?: string;
}

async function installBash(): Promise<InstallResult> {
  // macOS bash login shells read ~/.bash_profile, not ~/.bashrc
  const rcName = platform() === 'darwin' ? '.bash_profile' : '.bashrc';
  const rcFile = path.join(homedir(), rcName);
  if (await fileContains(rcFile, COMPLETION_MARKER)) {
    return { message: `Shell completions already installed in ${rcFile}` };
  }
  const snippet = `\n${COMPLETION_MARKER}\neval "$(ud completion -s bash)"\n`;
  await appendToFile(rcFile, snippet);
  return { message: `Shell completions added to ${rcFile}`, activateHint: `source ~/${rcName}` };
}

async function installZsh(program: Command): Promise<InstallResult> {
  const completionDir = path.join(homedir(), '.zsh', 'completions');
  const completionFile = path.join(completionDir, '_ud');

  // Write the completion script
  await mkdir(completionDir, { recursive: true });
  const script = generateCompletion(program, 'zsh');
  await writeFile(completionFile, script);

  // Ensure fpath includes the completions directory.
  // The fpath line must appear BEFORE any framework (oh-my-zsh, prezto, etc.)
  // that calls compinit, so we prepend it near the top of .zshrc rather than
  // appending at the end.
  const rcFile = path.join(homedir(), '.zshrc');
  const alreadyHasFpath = await fileContains(rcFile, '~/.zsh/completions');

  if (!alreadyHasFpath) {
    const fpathSnippet = `${COMPLETION_MARKER}\nfpath=(~/.zsh/completions $fpath)\n\n`;
    try {
      const existing = await readFile(rcFile, 'utf-8');
      await writeFile(rcFile, fpathSnippet + existing);
    } catch {
      // No .zshrc — create one with fpath + compinit (no framework to rely on)
      await writeFile(rcFile, `${fpathSnippet}autoload -Uz compinit && compinit\n`);
    }
  }

  return { message: `Shell completions written to ${completionFile}`, activateHint: 'source ~/.zshrc' };
}

async function installFish(program: Command): Promise<InstallResult> {
  const completionDir = path.join(homedir(), '.config', 'fish', 'completions');
  const completionFile = path.join(completionDir, 'ud.fish');

  await mkdir(completionDir, { recursive: true });
  const script = generateCompletion(program, 'fish');
  await writeFile(completionFile, script);

  // Fish auto-loads completions from ~/.config/fish/completions/ — no source needed
  return { message: `Shell completions written to ${completionFile}` };
}

async function installPowershell(program: Command): Promise<InstallResult> {
  // $PROFILE is not available in Node — use platform-appropriate default
  const profileDir = platform() === 'win32'
    ? path.join(homedir(), 'Documents', 'PowerShell')
    : path.join(homedir(), '.config', 'powershell');
  const profileFile = path.join(profileDir, 'Microsoft.PowerShell_profile.ps1');

  if (await fileContains(profileFile, COMPLETION_MARKER)) {
    return { message: `Shell completions already installed in ${profileFile}` };
  }

  const script = generateCompletion(program, 'powershell');
  const snippet = `\n${COMPLETION_MARKER}\n${script}`;
  await appendToFile(profileFile, snippet);

  return { message: `Shell completions added to ${profileFile}`, activateHint: `. $PROFILE` };
}

async function installCompletions(program: Command, shell: Shell): Promise<InstallResult> {
  switch (shell) {
    case 'bash':
      return installBash();
    case 'zsh':
      return installZsh(program);
    case 'fish':
      return installFish(program);
    case 'powershell':
      return installPowershell(program);
  }
}

// ---------------------------------------------------------------------------
// Skills installer (moved from skill.ts)
// ---------------------------------------------------------------------------

function getSkillsSource(): string {
  if (typeof __dirname === 'string') {
    // CJS bundle: dist/ud-cli.cjs → package root
    return path.resolve(__dirname, '..', 'skills', 'ud-cli');
  }
  // ESM: dist/commands/install.js → package root
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), '..', '..', 'skills', 'ud-cli');
}

async function installSkills(target?: string): Promise<void> {
  const cwd = target ?? process.cwd();
  const sourceDir = getSkillsSource();

  try {
    await access(sourceDir);
  } catch {
    console.error(
      chalk.red(
        'Skill files not found. If using a standalone binary, download from:\n' +
          '  https://github.com/unstoppabledomains/ud-cli/tree/main/skills/ud-cli',
      ),
    );
    process.exitCode = 1;
    return;
  }

  const destDir = path.join(cwd, '.claude', 'skills', 'ud-cli');
  await cp(sourceDir, destDir, { recursive: true });

  const relDest = path.relative(cwd, destDir);
  console.log(chalk.green(`Skill installed to ${relDest}/`));
  console.log(chalk.dim('Claude Code will now discover ud-cli commands automatically.'));
}

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

export function registerInstallCommand(program: Command): void {
  program
    .command('install')
    .description('Install shell completions and optional integrations')
    .option('--skills', 'Install coding agent skill to current directory')
    .option('--skills-target <dir>', 'Target directory for skill install')
    .action(async (opts: { skills?: boolean; skillsTarget?: string }) => {
      // Always install shell completions
      const shell = detectShell();
      if (shell) {
        try {
          const result = await installCompletions(program, shell);
          console.log(chalk.green(`\u2713 ${result.message}`));
          if (result.activateHint) {
            console.log(chalk.dim(`  To activate now, run: ${result.activateHint}`));
          }
        } catch (err) {
          console.error(
            chalk.red(`Failed to install shell completions: ${err instanceof Error ? err.message : String(err)}`),
          );
          process.exitCode = 1;
        }
      } else {
        console.log(
          chalk.yellow(
            'Could not detect your shell. Use "ud completion -s <shell>" to generate a script manually.',
          ),
        );
      }

      // Optionally install skills
      if (opts.skills || opts.skillsTarget) {
        await installSkills(opts.skillsTarget);
      }
    });
}
