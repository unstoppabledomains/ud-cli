import { Command } from 'commander';
import chalk from 'chalk';
import { getCommandDefaults, setCommandDefault, clearCommandDefault, getAllDefaults } from '../lib/config.js';
import type { OutputFormat } from '../lib/types.js';

const VALID_KEYS = ['fields', 'format', 'quiet'] as const;
const VALID_FORMATS: OutputFormat[] = ['table', 'json', 'csv'];

export function registerConfigCommands(program: Command): void {
  const cfg = program.command('config').description('Manage per-command default settings');

  cfg
    .command('set <command> <key> <value>')
    .description('Save a default option for a command (e.g., ud config set "domains list" fields name,expiresAt)')
    .action((command: string, key: string, value: string) => {
      if (!(VALID_KEYS as readonly string[]).includes(key)) {
        console.error(chalk.red(`Invalid key: ${key}. Must be one of: ${VALID_KEYS.join(', ')}`));
        process.exitCode = 1;
        return;
      }

      // Normalize command path: "domains list" → "domains.list"
      const commandPath = command.replace(/\s+/g, '.');

      if (key === 'format') {
        if (!(VALID_FORMATS as string[]).includes(value)) {
          console.error(chalk.red(`Invalid format: ${value}. Must be one of: ${VALID_FORMATS.join(', ')}`));
          process.exitCode = 1;
          return;
        }
      }

      if (key === 'quiet') {
        if (value !== 'true' && value !== 'false') {
          console.error(chalk.red('Invalid value for quiet. Must be true or false.'));
          process.exitCode = 1;
          return;
        }
        setCommandDefault(commandPath, key, value === 'true');
      } else {
        setCommandDefault(commandPath, key as 'fields' | 'format', value);
      }

      console.log(chalk.green(`Default ${key} for "${command}" set to: ${value}`));
    });

  cfg
    .command('get [command]')
    .description('Show saved defaults for a command, or all commands')
    .action((command?: string) => {
      if (command) {
        const commandPath = command.replace(/\s+/g, '.');
        const defaults = getCommandDefaults(commandPath);
        if (Object.keys(defaults).length === 0) {
          console.log(chalk.dim(`No saved defaults for "${command}".`));
          return;
        }
        console.log(chalk.bold(command));
        for (const [key, value] of Object.entries(defaults)) {
          console.log(`  ${key}: ${value}`);
        }
      } else {
        const all = getAllDefaults();
        const entries = Object.entries(all).filter(([, v]) => Object.keys(v).length > 0);
        if (entries.length === 0) {
          console.log(chalk.dim('No saved defaults.'));
          return;
        }
        for (const [path, defaults] of entries) {
          const displayPath = path.replace(/\./g, ' ');
          console.log(chalk.bold(displayPath));
          for (const [key, value] of Object.entries(defaults)) {
            console.log(`  ${key}: ${value}`);
          }
        }
      }
    });

  cfg
    .command('reset <command> [key]')
    .description('Remove saved defaults for a command')
    .action((command: string, key?: string) => {
      const commandPath = command.replace(/\s+/g, '.');

      if (key) {
        if (!(VALID_KEYS as readonly string[]).includes(key)) {
          console.error(chalk.red(`Invalid key: ${key}. Must be one of: ${VALID_KEYS.join(', ')}`));
          process.exitCode = 1;
          return;
        }
        clearCommandDefault(commandPath, key as 'fields' | 'format' | 'quiet');
        console.log(chalk.green(`Removed default ${key} for "${command}".`));
      } else {
        clearCommandDefault(commandPath);
        console.log(chalk.green(`Removed all defaults for "${command}".`));
      }
    });
}
