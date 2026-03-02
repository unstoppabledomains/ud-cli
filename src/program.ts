import { createRequire } from 'node:module';
import { Command } from 'commander';
import { setEnvOverride } from './lib/config.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerEnvCommands } from './commands/env.js';
import { registerApiCommands } from './commands/api-commands.js';
import { registerSmartCartAdd } from './commands/cart.js';
import { registerConfigCommands } from './commands/config.js';
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

const VALID_ENVS = ['production', 'staging'];
const VALID_FORMATS: OutputFormat[] = ['table', 'json', 'csv'];

export const program = new Command();

program
  .configureHelp({ showGlobalOptions: true })
  .name('ud')
  .description('Unstoppable Domains CLI')
  .version(getVersion())
  .option('--env <environment>', 'override active environment (production or staging)')
  .option('--format <format>', 'output format (table, json, csv)')
  .option('--quiet', 'suppress output except errors')
  .option('--verbose', 'show detailed output')
  .option('--fields [columns]', 'show available fields, or specify columns to display (e.g., name,expiresAt,listing.price)')
  .option('--profile <name>', 'configuration profile to use')
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
registerApiCommands(program);
registerSmartCartAdd(program);
