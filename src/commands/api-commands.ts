/**
 * Dynamically registers CLI commands from the OpenAPI spec + command registry.
 */

import { Command } from 'commander';
import { parseSpec } from '../lib/spec-parser.js';
import type { CommandSpec } from '../lib/spec-parser.js';
import { COMMAND_ROUTES } from '../lib/command-registry.js';
import type { CommandRoute } from '../lib/command-registry.js';
import { buildParams, specParamToOption, specParamToNestedOptions } from '../lib/param-builder.js';
import { callAction } from '../lib/api.js';
import { getCommandDefaults } from '../lib/config.js';
import { formatOutput, formatError, formatFieldsList, getKnownFields } from '../lib/formatter.js';
import { createSpinner } from '../lib/spinner.js';
import { getHooks, formatOperationHint, formatCartHint, formatFailureHints } from '../lib/command-hooks.js';
import type { PreActionContext } from '../lib/command-hooks.js';
import { applyMagicLinks, createMagicLinkUrl } from '../lib/magic-link.js';
import { promptInput, promptConfirm } from '../lib/prompt.js';
import { readFile } from 'node:fs/promises';
import chalk from 'chalk';
import type { OutputFormat } from '../lib/types.js';

/**
 * Human-readable descriptions for command groups and subgroups.
 * Keys are the full command path (e.g., 'dns.hosting.lander').
 */
const GROUP_DESCRIPTIONS: Record<string, string> = {
  // Top-level groups
  domains: 'Manage your domains, DNS, hosting, and contacts',
  cart: 'Manage your shopping cart and checkout',
  marketplace: 'Manage marketplace listings, offers, and leads',
  // Subgroups under domains
  'domains.tags': 'Add or remove domain tags',
  'domains.flags': 'Update domain flags (WHOIS privacy, transfer lock, etc.)',
  'domains.auto-renewal': 'Manage domain auto-renewal settings',
  'domains.dns': 'Manage DNS records and nameservers',
  'domains.dns.records': 'List, add, update, and remove DNS records',
  'domains.dns.nameservers': 'View and configure nameservers',
  'domains.hosting': 'Manage hosting configurations and AI landers',
  'domains.hosting.redirects': 'Manage redirects, proxies, and seller storefronts',
  'domains.hosting.landers': 'Manage AI-generated landing pages',
  'domains.contacts': 'Manage WHOIS contacts',
  // Subgroups under cart
  'cart.add': 'Add domains to your cart',
  // Subgroups under marketplace
  'marketplace.listings': 'Create and manage marketplace listings',
  'marketplace.offers': 'View and respond to domain offers',
  'marketplace.leads': 'Manage domain leads and messages',
};

function getRootOpts(cmd: Command): Record<string, unknown> {
  let current: Command = cmd;
  while (current.parent) current = current.parent;
  return current.opts<Record<string, unknown>>();
}

// Spec JSON is inlined by esbuild in bundled mode (via .json loader), loaded from disk in dev mode.
// Note: `with { type: 'json' }` import attributes require Node.js 21+ or tsx for unbundled dev.
// Production builds go through esbuild which handles this regardless of Node version.
import specJson from '../generated/openapi-spec.json' with { type: 'json' };

function loadSpec(): Map<string, CommandSpec> {
  const specs = parseSpec(specJson as unknown as Parameters<typeof parseSpec>[0]);
  const map = new Map<string, CommandSpec>();
  for (const spec of specs) {
    map.set(spec.toolName, spec);
  }
  return map;
}

/**
 * Register all API commands on the given Commander program.
 */
export function registerApiCommands(program: Command): void {
  const specMap = loadSpec();

  // Separate root-level commands (single-segment paths) from grouped commands
  const rootRoutes: CommandRoute[] = [];
  const groups = new Map<string, CommandRoute[]>();
  for (const route of COMMAND_ROUTES) {
    if (route.path.length === 1) {
      rootRoutes.push(route);
    } else {
      const groupName = route.path[0];
      const list = groups.get(groupName) ?? [];
      if (!groups.has(groupName)) groups.set(groupName, list);
      list.push(route);
    }
  }

  // Register root-level commands directly on program
  for (const route of rootRoutes) {
    registerRoute(program, route, specMap);
  }

  // Create group commands and register routes
  for (const [groupName, routes] of groups) {
    const groupDesc = GROUP_DESCRIPTIONS[groupName] ?? `Manage ${groupName}`;
    const groupCmd = program.commands.find((c) => c.name() === groupName)
      ?? program.command(groupName).description(groupDesc);

    for (const route of routes) {
      registerRoute(groupCmd, route, specMap);
    }
  }
}

function registerRoute(
  parent: Command,
  route: CommandRoute,
  specMap: Map<string, CommandSpec>,
): void {
  const spec = specMap.get(route.toolName);
  if (!spec) {
    // Route references a tool not in the OpenAPI spec — registers with no flags/empty body.
    // This can happen if the spec is stale or if a route was added for a not-yet-deployed endpoint.
    console.warn(`[warn] No spec found for tool: ${route.toolName}`);
  }
  const pathParts = route.path.slice(1); // remove the group prefix

  // Navigate/create subgroups
  let current = parent;
  let leafName: string;

  if (pathParts.length === 0) {
    // Root-level command (single-segment path) — parent is already the program
    leafName = route.path[0];
  } else {
    const pathSoFar = [route.path[0]]; // starts with the top-level group
    for (let i = 0; i < pathParts.length - 1; i++) {
      const subName = pathParts[i];
      pathSoFar.push(subName);
      const descKey = pathSoFar.join('.');
      const subDesc = GROUP_DESCRIPTIONS[descKey] ?? `Manage ${subName}`;
      const existing = current.commands.find((c) => c.name() === subName);
      current = existing ?? current.command(subName).description(subDesc);
    }
    leafName = pathParts[pathParts.length - 1];
  }
  const cmd = current.command(leafName);

  // Set description from spec or route override
  cmd.description(route.description ?? spec?.summary ?? `Run ${route.toolName}`);

  // Add positional args
  for (const arg of route.positionalArgs) {
    if (arg.variadic) {
      cmd.argument(
        arg.required ? `<${arg.name}...>` : `[${arg.name}...]`,
        arg.description,
      );
    } else {
      cmd.argument(
        arg.required ? `<${arg.name}>` : `[${arg.name}]`,
        arg.description,
      );
    }
  }

  // Add option flags from spec params
  if (spec) {
    const skipNames = new Set(route.positionalArgs.map((a) => a.name));
    for (const param of spec.params) {
      const opt = specParamToOption(param, skipNames);
      if (opt) {
        cmd.option(opt.flags, opt.description);
      }
    }

    // Add item-level flags for single-item shorthand (array-of-objects params)
    for (const param of spec.params) {
      if (param.type === 'array' && param.items?.type === 'object' && param.items.properties) {
        for (const prop of param.items.properties) {
          const itemOpt = specParamToOption(prop, skipNames);
          if (itemOpt) {
            cmd.option(itemOpt.flags, itemOpt.description);
          }
        }
      }
    }

    // Add flattened flags for nested object params (e.g., phone → --phone-dialing-prefix)
    for (const param of spec.params) {
      for (const nested of specParamToNestedOptions(param, skipNames)) {
        cmd.option(nested.flags, nested.description);
      }
    }
  }

  // --data and --file escape hatches
  cmd.option('--data <json>', 'Raw JSON request body (overrides all other params)');
  cmd.option('--file <path>', 'Read JSON request body from file');

  // Hook-driven options
  const hooks = getHooks(route.toolName);

  if (hooks?.priceOption) {
    cmd.option('--price <dollars>', 'Listing price in dollars (e.g., 99.99)');
  }
  if (hooks?.requireConfirm) {
    cmd.option('--confirm', 'Confirm the destructive operation without interactive prompt');
  }
  if (hooks?.promptInput) {
    // Only add the flag if the spec didn't already generate it
    const existingFlags = cmd.options.map((o) => o.long);
    if (!existingFlags.includes(`--${hooks.promptInput.flagName}`)) {
      cmd.option(`--${hooks.promptInput.flagName} <value>`, hooks.promptInput.prompt);
    }
  }

  // Hook-driven additional options (e.g., --html-file, --output-dir)
  if (hooks?.additionalOptions) {
    for (const opt of hooks.additionalOptions) {
      cmd.option(opt.flags, opt.description);
    }
  }

  // --domains-file for commands with variadic domains positional arg
  const hasVariadicDomains = route.positionalArgs.some((a) => a.name === 'domains' && a.variadic);
  if (hasVariadicDomains) {
    cmd.option('--domains-file <path>', 'Read domain names from a file (one per line)');
  }

  // Add known default fields to --help text
  const knownFields = getKnownFields(route.toolName, spec?.responseFields);
  if (knownFields && knownFields.defaults.length > 0) {
    cmd.addHelpText('after', `\nDefault Fields:\n  ${knownFields.defaults.join(', ')}\n\nUse --fields to see all available fields.`);
  }

  // Action handler
  cmd.action(async (...args: unknown[]) => {
    const opts = cmd.opts<Record<string, unknown>>();
    const globalOpts = getRootOpts(cmd);

    // --fields with no value (boolean true) → show available fields and exit
    if (globalOpts.fields === true) {
      const commandPath = route.path.join(' ');
      console.log(formatFieldsList(route.toolName, commandPath, spec?.responseFields));
      return;
    }

    // Merge: CLI flag > saved config default > hard-coded default
    const commandConfigPath = route.path.join('.');
    const savedDefaults = getCommandDefaults(commandConfigPath);

    const cliFormat = globalOpts.format as OutputFormat | undefined;
    const format: OutputFormat = cliFormat ?? savedDefaults.format ?? 'table';
    const quiet = globalOpts.quiet !== undefined ? !!globalOpts.quiet : savedDefaults.quiet ?? false;

    const cliFields = typeof globalOpts.fields === 'string'
      ? globalOpts.fields.split(',').map((f: string) => f.trim()).filter(Boolean)
      : undefined;
    const fields = cliFields
      ?? (savedDefaults.fields
        ? savedDefaults.fields.split(',').map((f: string) => f.trim()).filter(Boolean)
        : undefined);

    // Validate --fields values against known fields
    if (fields && fields.length > 0) {
      const known = getKnownFields(route.toolName, spec?.responseFields);
      if (known) {
        const invalid = fields.filter((f) => !known.all.includes(f));
        if (invalid.length > 0) {
          console.error(formatError(new Error(
            `Unknown field${invalid.length > 1 ? 's' : ''}: ${invalid.join(', ')}\n\nRun with --fields to see available fields.`,
          )));
          process.exitCode = 1;
          return;
        }
      }
    }

    // Collect positional values
    const positionalValues: Record<string, string | string[]> = {};
    for (let i = 0; i < route.positionalArgs.length; i++) {
      const argDef = route.positionalArgs[i];
      const val = args[i];
      if (val !== undefined) {
        positionalValues[argDef.name] = val as string | string[];
      }
    }

    // --domains-file: merge file contents with positional domains
    if (hasVariadicDomains && opts.domainsFile) {
      try {
        const fileContent = await readFile(opts.domainsFile as string, 'utf-8');
        const fileDomains = fileContent.split('\n').map((l) => l.trim()).filter(Boolean);
        const existing = positionalValues.domains;
        const arr = Array.isArray(existing) ? existing : existing ? [existing] : [];
        positionalValues.domains = [...arr, ...fileDomains];
      } catch (err) {
        console.error(formatError(new Error(`Failed to read --domains-file: ${err instanceof Error ? err.message : String(err)}`)));
        process.exitCode = 1;
        return;
      }
    }

    // Build request body
    let body = buildParams(route, spec?.params ?? [], positionalValues, opts);

    // Pre-call hooks: transformBody (e.g., price conversion, file reading)
    if (hooks?.transformBody) {
      try {
        body = await hooks.transformBody(body, opts);
      } catch (err) {
        console.error(formatError(err));
        process.exitCode = 1;
        return;
      }
    }

    // Pre-call hooks: preAction (e.g., checkout payment method check)
    if (hooks?.preAction) {
      const ctx: PreActionContext = { callAction, createMagicLinkUrl, promptInput, body };
      const preResult = await hooks.preAction(ctx);
      if (preResult?.message) console.log(preResult.message);
      if (preResult?.abort) return;
    }

    // Pre-call hooks: requireConfirm
    if (hooks?.requireConfirm && !opts.confirm) {
      const confirmed = await promptConfirm(hooks.requireConfirm.message);
      if (!confirmed) {
        console.log('Aborted.');
        return;
      }
    }
    // Set the API param if confirmation was given (via flag or prompt)
    if (hooks?.requireConfirm?.paramName) {
      body[hooks.requireConfirm.paramName] = true;
    }

    // Pre-call hooks: promptInput (e.g., OTP code)
    if (hooks?.promptInput) {
      const flagCamel = hooks.promptInput.flagName.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
      let value = opts[flagCamel] as string | undefined;
      if (!value) {
        value = await promptInput(hooks.promptInput.prompt, {
          validate: hooks.promptInput.validate,
        });
        if (!value) {
          console.log(`Aborted — use --${hooks.promptInput.flagName} <value> to provide input non-interactively.`);
          return;
        }
      }
      body[hooks.promptInput.paramName] = value;
    }

    const spinner = await createSpinner(`Running ${route.path.join(' ')}...`, { quiet, format });
    spinner.start();

    try {
      const result = await callAction(route.toolName, body);
      spinner.stop();

      // Post-call hook: postAction (side effects like file writing + optional result transform)
      let displayResult = result;
      if (hooks?.postAction) {
        displayResult = (await hooks.postAction(result, opts)) ?? result;
      }

      // Post-call hook: wrap URL fields in magic links for session handoff
      if (hooks?.magicLinkFields && typeof displayResult === 'object' && displayResult !== null) {
        await applyMagicLinks(displayResult as Record<string, unknown>, hooks.magicLinkFields);
      }

      if (!quiet) {
        const output = (hooks?.formatResult && format === 'table')
          ? hooks.formatResult(displayResult)
          : formatOutput(displayResult, {
              format,
              responsePattern: spec?.responsePattern,
              toolName: route.toolName,
              fields,
            });
        console.log(output);

        // Post-call hook: show failure hints for known error codes
        if (hooks?.showFailureHints) {
          const failHint = formatFailureHints(route.toolName, result);
          if (failHint) console.log(failHint);
        }

        // Post-call hook: show operation hint
        if (hooks?.showOperationHint) {
          const hint = formatOperationHint(result);
          if (hint) console.log(hint);
        }

        // Post-call hook: show cart-add hint
        if (hooks?.showCartHint) {
          const hint = formatCartHint(result);
          if (hint) console.log(hint);
        }

        // Post-call hook: post-action hint (static string or dynamic function)
        if (hooks?.postActionHint) {
          const hint = typeof hooks.postActionHint === 'function'
            ? hooks.postActionHint(result)
            : hooks.postActionHint;
          if (hint) console.log(hint);
        }

        // Show save hint when user explicitly passed --fields that differ from saved default
        if (cliFields && format === 'table') {
          const cliFieldsStr = cliFields.join(',');
          if (cliFieldsStr !== (savedDefaults.fields ?? '')) {
            const displayPath = route.path.join(' ');
            console.log(chalk.dim(`\nTip: To save these fields as default, run:\n  ud config set "${displayPath}" fields ${cliFieldsStr}`));
          }
        }
      }
    } catch (err) {
      spinner.fail('Failed');
      console.error(formatError(err));
      process.exitCode = 1;
    }
  });
}
