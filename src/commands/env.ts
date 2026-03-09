import { Command } from 'commander';
import chalk from 'chalk';
import { getDefaultEnv, setDefaultEnv, apiBaseUrl, getActiveEnv, getApiUrlOverride } from '../lib/config.js';
import type { Environment } from '../lib/types.js';

const VALID_ENVS: Environment[] = ['production', 'sandbox', 'staging'];

export function registerEnvCommands(program: Command): void {
  const env = program.command('env').description('Manage environment settings');

  env
    .command('show')
    .description('Show current environment')
    .action(() => {
      const current = getDefaultEnv();
      const active = getActiveEnv();
      const url = apiBaseUrl();
      const urlOverride = getApiUrlOverride();
      console.log(`Environment: ${chalk.bold(active)}`);
      const urlLabel = urlOverride
        ? `${chalk.dim(url)} ${chalk.yellow('(--api-url override)')}`
        : chalk.dim(url);
      console.log(`Base URL:    ${urlLabel}`);
      if (active !== current) {
        console.log(chalk.dim(`(default: ${current})`));
      }
    });

  env
    .command('set <environment>')
    .description('Set the default environment (production or sandbox)')
    .action((environment: string) => {
      if (!VALID_ENVS.includes(environment as Environment)) {
        console.error(chalk.red(`Invalid environment: ${environment}. Must be one of: ${VALID_ENVS.join(', ')}`));
        process.exitCode = 1;
        return;
      }

      setDefaultEnv(environment as Environment);
      console.log(chalk.green(`Default environment set to ${chalk.bold(environment)}.`));
      console.log(`Base URL: ${chalk.dim(apiBaseUrl(environment as Environment))}`);
    });
}
