/**
 * Translates CLI positional args and flags into API request body objects.
 */

import { readFileSync } from 'node:fs';
import type { CommandRoute } from './command-registry.js';
import type { ParamSpec } from './spec-parser.js';

/**
 * Build the API request body from CLI inputs.
 *
 * Priority (highest first):
 * 1. --data <json> — raw JSON override
 * 2. --file <path> — read JSON file as body
 * 3. Positional args + flags assembled from spec
 */
export function buildParams(
  route: CommandRoute,
  specParams: ParamSpec[],
  positionalValues: Record<string, string | string[]>,
  flags: Record<string, unknown>,
): Record<string, unknown> {
  // --data takes absolute priority
  if (flags.data) {
    try {
      return JSON.parse(flags.data as string) as Record<string, unknown>;
    } catch {
      throw new Error(`Invalid JSON in --data: ${flags.data}`);
    }
  }

  // --file reads a JSON file.
  // Security note: this is a local CLI tool run by the authenticated user, so path traversal
  // and file size are not concerns here (the user already has filesystem access). If this
  // ever runs in a shared/server context, add path validation and size limits.
  if (flags.file) {
    try {
      const content = readFileSync(flags.file as string, 'utf-8');
      return JSON.parse(content) as Record<string, unknown>;
    } catch (err) {
      throw new Error(`Failed to read --file: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  const body: Record<string, unknown> = {};

  // Map positional args into the body — only when the spec has a matching top-level param.
  // Positional args like "domain" for dns record add are consumed by the single-item
  // shorthand logic below, not mapped directly.
  for (const arg of route.positionalArgs) {
    const value = positionalValues[arg.name];
    if (value === undefined) continue;

    const specParam = specParams.find((p) => p.name === arg.name);
    if (!specParam) {
      // No matching top-level spec param — skip (will be consumed by shorthand)
      continue;
    }

    // Determine how to map the positional value
    if (specParam.type === 'array') {
      const values = Array.isArray(value) ? value : [value];
      if (specParam.items?.type === 'object') {
        // Array of objects — wrap each value using the primary key from the spec
        const wrapKey = deriveWrapKey(specParam);
        body[arg.name] = values.map((v) => ({ [wrapKey]: v }));
      } else {
        body[arg.name] = values;
      }
    } else {
      // Scalar positional
      body[arg.name] = Array.isArray(value) ? value[0] : value;
    }
  }

  // Map flags into the body with type coercion
  for (const spec of specParams) {
    // Skip params already set by positional args
    if (body[spec.name] !== undefined) continue;

    const flagName = specParamToFlagName(spec.name);
    const rawValue = flags[flagName] ?? flags[spec.name];
    if (rawValue === undefined) continue;

    body[spec.name] = coerceValue(rawValue, spec);
  }

  // Handle single-item shorthand for array-of-objects params.
  // If a param expects records: [{domain, type, values}] but the user
  // passed --type A --values 1.2.3.4 along with a positional domain,
  // wrap the loose flags into the first array element.
  for (const spec of specParams) {
    if (spec.type === 'array' && spec.items?.type === 'object' && spec.items.properties) {
      if (body[spec.name] !== undefined) continue;

      const itemProps = spec.items.properties;
      const item: Record<string, unknown> = {};
      let hasAny = false;

      for (const prop of itemProps) {
        const flagName = specParamToFlagName(prop.name);
        const rawValue = flags[flagName] ?? flags[prop.name];
        if (rawValue !== undefined) {
          item[prop.name] = coerceValue(rawValue, prop);
          hasAny = true;
        }
      }

      // Also pull in any positional domain value for the record
      if (item.domain === undefined && positionalValues.domain) {
        const domVal = positionalValues.domain;
        item.domain = Array.isArray(domVal) ? domVal[0] : domVal;
        hasAny = true;
      }

      if (hasAny) {
        body[spec.name] = [item];
      }
    }
  }

  return body;
}

/**
 * Derive the wrapping key for array-of-objects positional args.
 * Uses the first required string property from the spec, falling back to "name".
 */
export function deriveWrapKey(spec: ParamSpec): string {
  if (spec.items?.properties) {
    const reqStr = spec.items.properties.find((p) => p.required && p.type === 'string');
    if (reqStr) return reqStr.name;
  }
  return 'name';
}

/**
 * Coerce a CLI flag value to the type expected by the spec.
 */
function coerceValue(value: unknown, spec: ParamSpec): unknown {
  if (value === undefined || value === null) return value;

  switch (spec.type) {
    case 'number':
      return Number(value);
    case 'boolean':
      if (value === 'false' || value === '0') return false;
      if (value === 'true' || value === '1') return true;
      return Boolean(value);
    case 'array': {
      // Handle comma-separated values: "x,crypto" → ["x", "crypto"]
      let arr: unknown[];
      if (typeof value === 'string') {
        arr = value.split(',').map((v) => v.trim());
      } else {
        arr = Array.isArray(value) ? value : [value];
      }
      // Coerce individual items to the spec's item type (e.g., number[])
      if (spec.items?.type === 'number') {
        return arr.map((v) => Number(v));
      }
      return arr;
    }
    default:
      return value;
  }
}

/**
 * Convert a camelCase spec param name to kebab-case flag name.
 * e.g. "pageSize" → "page-size", "discountCode" → "discount-code"
 */
function specParamToFlagName(name: string): string {
  return name.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase());
}

/**
 * Generate Commander option flags for a spec param.
 * Returns the flag string and description.
 */
export function specParamToOption(
  spec: ParamSpec,
  skipNames: Set<string>,
): { flags: string; description: string } | null {
  if (skipNames.has(spec.name)) return null;

  // Skip complex nested objects that should use --data
  if (spec.type === 'object' && spec.properties && spec.properties.length > 0) return null;
  // Skip array-of-objects (handled by single-item shorthand or --data)
  if (spec.type === 'array' && spec.items?.type === 'object') return null;

  const flagName = specParamToFlagName(spec.name);

  const flags = spec.type === 'boolean' ? `--${flagName}` : `--${flagName} <${spec.name}>`;

  let description = spec.description ?? '';
  if (spec.enum) {
    description += ` (${spec.enum.join(', ')})`;
  }
  if (spec.default !== undefined) {
    description += ` [default: ${spec.default}]`;
  }

  return { flags, description };
}
