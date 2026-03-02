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

## Testing

- Shared test helpers live in `tests/helpers/`. Use `createMemoryStore` from `tests/helpers/memoryStore.ts` instead of duplicating it per test file.
- All test files that use Commander must apply `exitOverride` recursively to prevent `process.exit` from killing the test worker. See `applyExitOverride` pattern in test files.
- Tests use `@jest/globals` with Jest (not vitest).

## Code Patterns

- **Command hooks** (`src/lib/command-hooks.ts`): Declarative registry for per-command behavior (confirmations, prompts, operation hints). Add entries here instead of modifying `registerRoute`.
- **Async I/O**: Use `node:fs/promises` (async) instead of `node:fs` (sync) in action handlers.
- **Interactive prompts** (`src/lib/prompt.ts`): `promptInput` retries up to 3 times on validation failure. Returns empty string in non-TTY environments.
