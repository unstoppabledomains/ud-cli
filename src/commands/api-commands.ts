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
import type { OutputFormat } from '../lib/types.js';

function getRootOpts(cmd: Command): Record<string, unknown> {
  let current: Command = cmd;
  while (current.parent) current = current.parent;
  return current.opts<Record<string, unknown>>();
}

// Spec JSON is inlined by esbuild in bundled mode, but loaded from disk in dev mode
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
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(route);
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

    // Build request body
    const body = buildParams(route, spec?.params ?? [], positionalValues, opts);

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
      }
    } catch (err) {
      spinner.fail('Failed');
      console.error(formatError(err));
      process.exitCode = 1;
    }
  });
}
