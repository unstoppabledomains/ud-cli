import { createRequire } from 'node:module';
import { Command, Help } from 'commander';
import { setEnvOverride } from './lib/config.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerEnvCommands } from './commands/env.js';
import { registerApiCommands } from './commands/api-commands.js';
import { registerSmartCartAdd } from './commands/cart.js';
import { registerConfigCommands } from './commands/config.js';
import { registerUpdateCommands } from './commands/update.js';
import { registerSkillCommands } from './commands/skill.js';
import type { Environment, OutputFormat } from './lib/types.js';

// In esbuild CJS bundle, __PKG_VERSION__ is injected at build time.
// In ESM (tsc output, tsx dev), we read package.json at runtime.
declare const __PKG_VERSION__: string | undefined;

function getVersion(): string {
  // typeof avoids ReferenceError when __PKG_VERSION__ is not injected (ESM/dev)
  if (typeof __PKG_VERSION__ === 'string') return __PKG_VERSION__;
  const req = createRequire(import.meta.url);
  return (req('../package.json') as { version: string }).version;
}

const VALID_ENVS = ['production', 'sandbox', 'staging'];
const VALID_FORMATS: OutputFormat[] = ['table', 'json', 'csv'];

export const program = new Command();

// Commands listed here appear under "Utilities:" in root help output.
// Everything else appears under "Commands:". Update this set when adding new
// utility-style commands so they don't silently land in the wrong group.
const UTILITY_COMMANDS = new Set(['config', 'env', 'help', 'skill', 'update']);

program
  .configureHelp({
    showGlobalOptions: true,
    sortSubcommands: true,
    visibleCommands(cmd) {
      const cmds = Help.prototype.visibleCommands.call(this, cmd);
      return cmds.sort((a, b) => {
        const aUtil = UTILITY_COMMANDS.has(a.name());
        const bUtil = UTILITY_COMMANDS.has(b.name());
        if (aUtil !== bUtil) return aUtil ? 1 : -1;
        return a.name().localeCompare(b.name());
      });
    },
    formatHelp(cmd, helper) {
      // Subcommands use the default single "Commands:" section
      if (cmd.parent) {
        return Help.prototype.formatHelp.call(this, cmd, helper);
      }

      // Root command: render grouped command sections instead of one flat list.
      // Suppress the default "Commands:" block by temporarily hiding all commands,
      // then append our own grouped sections.
      const allCmds = helper.visibleCommands(cmd);
      const origVisible = helper.visibleCommands;
      helper.visibleCommands = () => [];
      const base = Help.prototype.formatHelp.call(this, cmd, helper);
      // Restore before padWidth() so alignment accounts for all commands, not just the empty override.
      helper.visibleCommands = origVisible;

      const termWidth = helper.padWidth(cmd, helper);
      const fmt = (c: Command) =>
        helper.formatItem(
          helper.styleSubcommandTerm(helper.subcommandTerm(c)),
          termWidth,
          helper.styleSubcommandDescription(helper.subcommandDescription(c)),
          helper,
        );

      const core = allCmds.filter((c: Command) => !UTILITY_COMMANDS.has(c.name()));
      const utils = allCmds.filter((c: Command) => UTILITY_COMMANDS.has(c.name()));

      const sections: string[] = [''];
      if (core.length) sections.push(helper.styleTitle('Commands:'), ...core.map(fmt), '');
      if (utils.length) sections.push(helper.styleTitle('Utilities:'), ...utils.map(fmt), '');

      return base + sections.join('\n');
    },
  })
  .name('ud')
  .description('Unstoppable Domains CLI — Search, register, and manage your domains from the command line.')
  .version(getVersion(), '-V, --version', 'Output the version number')
  .helpOption('-h, --help', 'Display help for command')
  .helpCommand('help [command]', 'Display help for command')
  .option('--env <environment>', 'Override active environment (production or sandbox)')
  .option('--format <format>', 'Output format (table, json, csv)')
  .option('--quiet', 'Suppress output except errors')
  .option('--verbose', 'Show detailed output')
  .option('--fields [columns]', 'Show available fields, or specify columns to display (e.g., name,expiresAt,listing.price)')
  .option('--profile <name>', 'Configuration profile to use')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ env?: string; format?: string }>();
    if (opts.env) {
      if (!VALID_ENVS.includes(opts.env)) {
        thisCommand.error(`Invalid environment: ${opts.env}. Must be one of: ${VALID_ENVS.join(', ')}`);
      }
      setEnvOverride(opts.env as Environment);
    }
    if (opts.format && !(VALID_FORMATS as string[]).includes(opts.format)) {
      thisCommand.error(`Invalid format: ${opts.format}. Must be one of: ${VALID_FORMATS.join(', ')}`);
    }
  });

registerAuthCommands(program);
registerEnvCommands(program);
registerConfigCommands(program);
registerUpdateCommands(program);
registerSkillCommands(program);
registerApiCommands(program);
registerSmartCartAdd(program);

// --- Background update check (once per 24 h, after command execution) ---
program.hook('postAction', async (_thisCommand, actionCommand) => {
  // postAction fires for every command in the chain; only run for the leaf action
  if (actionCommand !== _thisCommand) return;

  // Skip during update commands (they already check) — covers both
  // "ud update" (name=update) and "ud update check" (parent.name=update)
  if (actionCommand.name() === 'update' || actionCommand.parent?.name() === 'update') return;

  // Skip in non-TTY (piped output)
  if (!process.stderr.isTTY) return;

  // Lazy-import to avoid loading update module on every invocation
  const { shouldCheckForUpdate, checkForUpdate, recordUpdateCheck } = await import('./lib/update.js');

  if (!shouldCheckForUpdate()) return;

  try {
    const result = await checkForUpdate({ timeoutMs: 5000 });
    recordUpdateCheck();
    if (result.updateAvailable) {
      const chalk = (await import('chalk')).default;
      process.stderr.write(
        chalk.yellow(`\nUpdate available: ${result.current} → ${result.latest}`) +
        chalk.dim(' — run "ud update" to upgrade\n'),
      );
    }
  } catch {
    // Silently ignore — update check failures should never break the CLI
  }
});
