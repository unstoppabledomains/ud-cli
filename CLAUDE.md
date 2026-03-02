# ud-cli Development Guidelines

## Table Output Standards

- **Column headers** must be human-readable. The `formatHeaderName()` function in `src/lib/formatter.ts` converts raw column keys to title case automatically:
  - camelCase is expanded: `expiresAt` → "Expires At"
  - Dot notation is expanded: `autoRenewal.status` → "Auto Renewal Status"
  - This applies to both table and CSV output formats.
- **Date values** use a fixed `en-US` locale format (`Mar 2, 2026`) via `toLocaleDateString('en-US', ...)` to ensure deterministic output across environments.
- **TABLE_CONFIGS** in `src/lib/formatter.ts` define curated column selections per API endpoint. When adding a new endpoint, add its config entry.
- **DETAIL_CONFIGS** in `src/lib/formatter.ts` define vertical key-value detail views for single-item responses. When a response has exactly 1 row and a detail config exists, the detail view is used instead of the table. Use this for commands like `domains get` where a single item has many nested fields.
- **Flag statuses** (`ENABLED`/`DISABLED`) are automatically color-formatted in detail views via `formatDetailValue()`.
- **Field discovery**: `--fields` (no argument) shows all available fields for a command. `--fields col1,col2` selects specific columns. Field values are validated against known fields — invalid names produce an error with a hint to run `--fields` for the list. Fields come from three sources merged together: `TABLE_CONFIGS` (defaults), `DETAIL_CONFIGS` (detail view paths), and `responseFields` (auto-extracted from the OpenAPI response schema in `spec-parser.ts`). When adding a new endpoint, adding its `TABLE_CONFIGS` entry is sufficient — the OpenAPI spec fields are extracted automatically.
- **`DATA_ARRAY_KEYS`** in `spec-parser.ts` lists the response keys that hold primary data arrays (e.g., `results`, `domains`, `items`). If a new endpoint uses a different key for its data array, add it to both `DATA_ARRAY_KEYS` in `spec-parser.ts` and `arrayKeys` in `extractTableData()` in `formatter.ts`.

## Testing

- Shared test helpers live in `tests/helpers/`. Use `createMemoryStore` from `tests/helpers/memoryStore.ts` instead of duplicating it per test file.
- All test files that use Commander must apply `exitOverride` recursively to prevent `process.exit` from killing the test worker. See `applyExitOverride` pattern in test files.
- Tests use `@jest/globals` with Jest (not vitest).

## Code Patterns

- **Command hooks** (`src/lib/command-hooks.ts`): Declarative registry for per-command behavior (confirmations, prompts, operation hints). Add entries here instead of modifying `registerRoute`.
- **Async I/O**: Use `node:fs/promises` (async) instead of `node:fs` (sync) in action handlers.
- **Interactive prompts** (`src/lib/prompt.ts`): `promptInput` retries up to 3 times on validation failure. Returns empty string in non-TTY environments.
