import { Command } from 'commander';
import { setEnvOverride } from './lib/config.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerEnvCommands } from './commands/env.js';
import { registerApiCommands } from './commands/api-commands.js';
import type { Environment } from './lib/types.js';

const VALID_ENVS = ['production', 'staging'];
const VALID_FORMATS = ['table', 'json', 'csv'];

export const program = new Command();

program
  .name('ud')
  .description('Unstoppable Domains CLI')
  .version('0.1.0')
  .option('--env <environment>', 'override active environment (production or staging)')
  .option('--format <format>', 'output format (table, json, csv)', 'table')
  .option('--quiet', 'suppress output except errors')
  .option('--verbose', 'show detailed output')
  .option('--profile <name>', 'configuration profile to use')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ env?: string; format?: string }>();
    if (opts.env) {
      if (!VALID_ENVS.includes(opts.env)) {
        thisCommand.error(`Invalid environment: ${opts.env}. Must be one of: ${VALID_ENVS.join(', ')}`);
      }
      setEnvOverride(opts.env as Environment);
    }
    if (opts.format && !VALID_FORMATS.includes(opts.format)) {
      thisCommand.error(`Invalid format: ${opts.format}. Must be one of: ${VALID_FORMATS.join(', ')}`);
    }
  });

registerAuthCommands(program);
registerEnvCommands(program);
registerApiCommands(program);
