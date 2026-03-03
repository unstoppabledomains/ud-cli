import { Command } from 'commander';
import { cp, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import chalk from 'chalk';

// In esbuild CJS bundle, __dirname is available.
// In ESM (tsc output, tsx dev), we use import.meta.url.
declare const __dirname: string | undefined;

function getSkillsSource(): string {
  if (typeof __dirname === 'string') {
    // CJS bundle: dist/ud-cli.cjs → package root
    return path.resolve(__dirname, '..', 'skills', 'ud-cli');
  }
  // ESM: dist/commands/skill.js → package root
  const thisFile = fileURLToPath(import.meta.url);
  return path.resolve(path.dirname(thisFile), '..', '..', 'skills', 'ud-cli');
}

export function registerSkillCommands(program: Command): void {
  const skill = program
    .command('skill')
    .description('Manage coding agent skills');

  skill
    .command('install')
    .description('Install ud-cli skill for Claude Code')
    .option('--target <dir>', 'Target directory (default: current working directory)')
    .action(async (opts: { target?: string }) => {
      const cwd = opts.target ?? process.cwd();
      const sourceDir = getSkillsSource();

      try {
        await access(sourceDir);
      } catch {
        console.error(chalk.red(
          'Skill files not found. If using a standalone binary, download from:\n' +
          '  https://github.com/unstoppabledomains/ud-cli/tree/main/skills/ud-cli',
        ));
        process.exitCode = 1;
        return;
      }

      const destDir = path.join(cwd, '.claude', 'skills', 'ud-cli');
      await cp(sourceDir, destDir, { recursive: true });

      const relDest = path.relative(cwd, destDir);
      console.log(chalk.green(`Skill installed to ${relDest}/`));
      console.log(chalk.dim('Claude Code will now discover ud-cli commands automatically.'));
    });
}
