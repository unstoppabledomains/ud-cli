import { Command } from 'commander';
import { setEnvOverride } from './lib/config.js';
import { registerAuthCommands } from './commands/auth.js';
import { registerEnvCommands } from './commands/env.js';
import type { Environment } from './lib/types.js';

const VALID_ENVS = ['production', 'staging'];

export const program = new Command();

program
  .name('ud')
  .description('Unstoppable Domains CLI')
  .version('0.1.0')
  .option('--env <environment>', 'override active environment (production or staging)')
  .hook('preAction', (thisCommand) => {
    const opts = thisCommand.opts<{ env?: string }>();
    if (opts.env) {
      if (!VALID_ENVS.includes(opts.env)) {
        thisCommand.error(`Invalid environment: ${opts.env}. Must be one of: ${VALID_ENVS.join(', ')}`);
      }
      setEnvOverride(opts.env as Environment);
    }
  });

registerAuthCommands(program);
registerEnvCommands(program);
