import { Command } from 'commander';
import chalk from 'chalk';
import { createSpinner } from '../lib/spinner.js';
import {
  checkForUpdate,
  isBinaryInstall,
  selfUpdate,
  type UpdateInfo,
} from '../lib/update.js';

export function registerUpdateCommands(program: Command): void {
  const update = program
    .command('update')
    .description('Update to the latest version')
    .action(async () => {
      const spinner = await createSpinner('Checking for updates…');
      spinner.start();

      let info: UpdateInfo;
      try {
        info = await checkForUpdate();
      } catch (err) {
        spinner.fail('Failed to check for updates.');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
        return;
      }

      if (!info.updateAvailable) {
        spinner.succeed(`Already up to date (${chalk.bold(info.current)}).`);
        return;
      }

      spinner.info(`Update available: ${chalk.dim(info.current)} → ${chalk.bold(info.latest)}`);

      if (!isBinaryInstall()) {
        console.log();
        console.log('This installation is managed by npm. Run:');
        console.log(chalk.cyan('  npm update -g @unstoppabledomains/ud-cli'));
        return;
      }

      const dlSpinner = await createSpinner(`Downloading v${info.latest}…`);
      dlSpinner.start();

      try {
        const result = await selfUpdate(info.latest);
        dlSpinner.succeed(
          `Updated successfully: ${chalk.dim(result.previousVersion)} → ${chalk.bold(result.newVersion)}`,
        );
      } catch (err) {
        dlSpinner.fail('Update failed.');
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });

  update
    .command('check')
    .description('Check if a newer version is available')
    .action(async () => {
      try {
        const info = await checkForUpdate();
        if (info.updateAvailable) {
          console.log(
            `Update available: ${chalk.dim(info.current)} → ${chalk.bold(info.latest)}`,
          );
          console.log(chalk.dim('Run "ud update" to upgrade.'));
        } else {
          console.log(`Up to date: ${chalk.bold(info.current)}`);
        }
      } catch (err) {
        console.error(chalk.red('Failed to check for updates.'));
        console.error(chalk.red(err instanceof Error ? err.message : String(err)));
        process.exitCode = 1;
      }
    });
}
