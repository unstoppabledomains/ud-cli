#!/usr/bin/env tsx
/**
 * Downloads the OpenAPI spec from the MCP API and writes it to src/generated/openapi-spec.json.
 * Run via: npm run fetch-spec
 *
 * TODO: Add a CI check that runs this script in dry-run mode and fails if the fetched spec
 * differs from the committed version, to detect spec drift from the live API.
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SPEC_URL = 'https://api.unstoppabledomains.com/mcp/v1/openapi.json';
const OUTPUT_PATH = resolve(__dirname, '..', 'src', 'generated', 'openapi-spec.json');

async function main() {
  console.log(`Fetching OpenAPI spec from ${SPEC_URL}...`);

  const res = await fetch(SPEC_URL);
  if (!res.ok) {
    throw new Error(`Failed to fetch spec: ${res.status} ${res.statusText}`);
  }

  const spec = (await res.json()) as Record<string, unknown>;

  // Basic validation
  if (!spec.openapi || !spec.paths) {
    throw new Error('Invalid OpenAPI spec: missing "openapi" or "paths" fields');
  }

  const pathCount = Object.keys(spec.paths as Record<string, unknown>).length;
  console.log(`Spec version: ${spec.openapi}, paths: ${pathCount}`);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, JSON.stringify(spec, null, 2) + '\n');
  console.log(`Written to ${OUTPUT_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
