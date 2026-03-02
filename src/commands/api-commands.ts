/**
 * Dynamically registers CLI commands from the OpenAPI spec + command registry.
 */

import { Command } from 'commander';
import { parseSpec } from '../lib/spec-parser.js';
import type { CommandSpec } from '../lib/spec-parser.js';
import { COMMAND_ROUTES } from '../lib/command-registry.js';
import type { CommandRoute } from '../lib/command-registry.js';
import { buildParams, specParamToOption } from '../lib/param-builder.js';
import { callAction } from '../lib/api.js';
import { formatOutput, formatError } from '../lib/formatter.js';
import { createSpinner } from '../lib/spinner.js';
import { getHooks, formatOperationHint } from '../lib/command-hooks.js';
import { promptInput, promptConfirm } from '../lib/prompt.js';
import { readFile } from 'node:fs/promises';
import type { OutputFormat } from '../lib/types.js';

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

  // Group routes by their top-level path segment
  const groups = new Map<string, CommandRoute[]>();
  for (const route of COMMAND_ROUTES) {
    const groupName = route.path[0];
    const list = groups.get(groupName) ?? [];
    if (!groups.has(groupName)) groups.set(groupName, list);
    list.push(route);
  }

  // Create group commands and register routes
  for (const [groupName, routes] of groups) {
    const groupCmd = program.commands.find((c) => c.name() === groupName)
      ?? program.command(groupName).description(`Manage ${groupName}`);

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
  for (let i = 0; i < pathParts.length - 1; i++) {
    const subName = pathParts[i];
    const existing = current.commands.find((c) => c.name() === subName);
    current = existing ?? current.command(subName).description(`${subName} operations`);
  }

  // Create the leaf command
  const leafName = pathParts[pathParts.length - 1];
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
  }

  // --data and --file escape hatches
  cmd.option('--data <json>', 'Raw JSON request body (overrides all other params)');
  cmd.option('--file <path>', 'Read JSON request body from file');

  // Hook-driven options
  const hooks = getHooks(route.toolName);
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

  // --domains-file for commands with variadic domains positional arg
  const hasVariadicDomains = route.positionalArgs.some((a) => a.name === 'domains' && a.variadic);
  if (hasVariadicDomains) {
    cmd.option('--domains-file <path>', 'Read domain names from a file (one per line)');
  }

  // Action handler
  cmd.action(async (...args: unknown[]) => {
    const opts = cmd.opts<Record<string, unknown>>();
    const globalOpts = getRootOpts(cmd);

    const format = (globalOpts.format as OutputFormat) ?? 'table';
    const quiet = !!globalOpts.quiet;

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
    const body = buildParams(route, spec?.params ?? [], positionalValues, opts);

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

    const spinner = await createSpinner(`Running ${route.toolName}...`, { quiet, format });
    spinner.start();

    try {
      const result = await callAction(route.toolName, body);
      spinner.stop();

      if (!quiet) {
        const output = formatOutput(result, {
          format,
          responsePattern: spec?.responsePattern,
          toolName: route.toolName,
        });
        console.log(output);

        // Post-call hook: show operation hint
        if (hooks?.showOperationHint) {
          const hint = formatOperationHint(result);
          if (hint) console.log(hint);
        }
      }
    } catch (err) {
      spinner.fail('Failed');
      console.error(formatError(err));
      process.exitCode = 1;
    }
  });
}
