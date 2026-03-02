/**
 * Smart cart-add command that auto-detects domain source and routes to the correct endpoint.
 */

import type { Command } from 'commander';
import { callAction } from '../lib/api.js';
import { formatOutput, formatError } from '../lib/formatter.js';
import { createSpinner } from '../lib/spinner.js';
import { SOURCE_TO_CART_CMD } from '../lib/command-hooks.js';
import type { OutputFormat } from '../lib/types.js';

/** Reverse map: subcommand → tool name */
const CART_CMD_TO_TOOL: Record<string, string> = {
  registration: 'ud_cart_add_domain_registration',
  listed: 'ud_cart_add_domain_listed',
  afternic: 'ud_cart_add_domain_afternic',
  sedo: 'ud_cart_add_domain_sedo',
  renewal: 'ud_cart_add_domain_renewal',
};

function getRootOpts(cmd: Command): Record<string, unknown> {
  let current: Command = cmd;
  while (current.parent) current = current.parent;
  return current.opts<Record<string, unknown>>();
}

/**
 * Register the smart `cart add [domain...]` default handler.
 * Must be called after registerApiCommands so the `cart > add` group already exists.
 */
export function registerSmartCartAdd(program: Command): void {
  // Find the existing cart > add group command
  const cartCmd = program.commands.find((c) => c.name() === 'cart');
  if (!cartCmd) return;

  const addCmd = cartCmd.commands.find((c) => c.name() === 'add');
  if (!addCmd) return;

  // Add default action on the `add` group itself: `ud cart add <domain...>`
  addCmd
    .argument('[domain...]', 'Domain name(s) to add to cart')
    .option('--type <type>', 'Cart type: registration, listed, afternic, sedo, renewal')
    .option('--years <years>', 'Registration years')
    .action(async (domains: string[], opts: Record<string, unknown>) => {
      if (domains.length === 0) {
        addCmd.help();
        return;
      }

      const globalOpts = getRootOpts(addCmd);
      const format = (globalOpts.format as OutputFormat) ?? 'table';
      const quiet = !!globalOpts.quiet;

      // Validate --years before the loop to avoid wasting search API calls
      let yearsQuantity: number | undefined;
      if (opts.years !== undefined) {
        const yearsNum = Number(opts.years);
        if (!Number.isInteger(yearsNum) || yearsNum < 1 || yearsNum > 10) {
          console.error(formatError(new Error('Invalid --years value: must be an integer between 1 and 10.')));
          process.exitCode = 1;
          return;
        }
        yearsQuantity = yearsNum;
      }

      for (const domain of domains) {
        let toolName: string;

        if (opts.type) {
          // Explicit type → route directly
          const type = opts.type as string;
          toolName = CART_CMD_TO_TOOL[type];
          if (!toolName) {
            console.error(formatError(new Error(
              `Unknown cart type: ${type}. Valid types: ${Object.keys(CART_CMD_TO_TOOL).join(', ')}`,
            )));
            process.exitCode = 1;
            return;
          }
        } else {
          // Smart detection: search for the domain
          const spinner = await createSpinner(`Checking ${domain}...`, { quiet, format });
          spinner.start();

          try {
            const searchResult = await callAction('ud_domains_search', { query: domain }) as Record<string, unknown>;
            spinner.stop();

            const results = searchResult.results as Record<string, unknown>[] | undefined;
            const match = results?.find((r) => r.name === domain);

            const marketplace = match?.marketplace as Record<string, unknown> | undefined;
            const source = marketplace?.source as string | undefined;

            // Marketplace domains (afternic, sedo) may have available=false for registration
            // but are still purchasable via their marketplace route.
            const hasMarketplaceRoute = source != null && source in SOURCE_TO_CART_CMD;
            if (!match || (match.available !== true && !hasMarketplaceRoute)) {
              console.error(formatError(new Error(
                `Domain not available: ${domain}`,
              )));
              process.exitCode = 1;
              continue;
            }

            const subCmd = SOURCE_TO_CART_CMD[source ?? ''] ?? 'registration';
            toolName = CART_CMD_TO_TOOL[subCmd];
          } catch (err) {
            spinner.fail('Failed');
            console.error(formatError(err));
            process.exitCode = 1;
            continue;
          }
        }

        // Call the resolved cart-add endpoint
        // All cart-add endpoints use "name" as the domain key in their request body.
        const body: Record<string, unknown> = {
          domains: [{ name: domain }],
        };
        if (yearsQuantity !== undefined) {
          (body.domains as Record<string, unknown>[])[0].quantity = yearsQuantity;
        }

        const spinner = await createSpinner(`Adding ${domain} to cart...`, { quiet, format });
        spinner.start();

        try {
          const result = await callAction(toolName, body);
          spinner.stop();

          if (!quiet) {
            const output = formatOutput(result, { format, toolName });
            console.log(output);
          }
        } catch (err) {
          spinner.fail('Failed');
          console.error(formatError(err));
          process.exitCode = 1;
        }
      }
    });
}
