import { Command } from 'commander';
import { generateCompletion, SUPPORTED_SHELLS } from '../lib/completion.js';
import type { Shell } from '../lib/completion.js';

export function registerCompletionCommand(program: Command): void {
  program
    .command('completion')
    .description('Generate shell completion scripts')
    .requiredOption('-s, --shell <shell>', `Shell type (${SUPPORTED_SHELLS.join(', ')})`)
    .addHelpText(
      'after',
      [
        '',
        'Examples:',
        '  # Bash — add to ~/.bashrc',
        '  eval "$(ud completion -s bash)"',
        '',
        '  # Zsh — save to a directory in your $fpath',
        '  ud completion -s zsh > "${fpath[1]}/_ud"',
        '',
        '  # Fish',
        '  ud completion -s fish > ~/.config/fish/completions/ud.fish',
        '',
        '  # PowerShell — add to $PROFILE',
        '  ud completion -s powershell >> $PROFILE',
        '',
        'Tip: Run "ud install" to auto-detect your shell and set this up for you.',
      ].join('\n'),
    )
    .action((opts: { shell: string }) => {
      const shell = opts.shell.toLowerCase();
      if (!SUPPORTED_SHELLS.includes(shell as Shell)) {
        console.error(
          `Unsupported shell: ${shell}. Must be one of: ${SUPPORTED_SHELLS.join(', ')}`,
        );
        process.exitCode = 1;
        return;
      }

      const output = generateCompletion(program, shell as Shell);
      process.stdout.write(output);
    });
}
