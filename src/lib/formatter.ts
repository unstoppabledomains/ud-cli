/**
 * Output formatting engine for CLI results.
 * Supports JSON, table, and CSV output formats.
 */

import chalk from 'chalk';
import Table from 'cli-table3';
import type { OutputFormat } from './types.js';
import type { ResponsePattern } from './spec-parser.js';

interface FormatOptions {
  format: OutputFormat;
  responsePattern?: ResponsePattern;
  toolName?: string;
}

/**
 * Format and print API response data.
 */
export function formatOutput(data: unknown, options: FormatOptions): string {
  const { format } = options;

  if (format === 'json') {
    return formatJson(data);
  }

  const obj = data as Record<string, unknown>;

  let main: string;
  if (format === 'csv') {
    main = formatCsv(data, options);
  } else {
    main = formatTable(data, options);
  }

  // Only append annotations for table format — they break CSV/JSON machine parsing
  if (format === 'table') {
    const bulkSummary = formatBulkSummary(obj);
    const paginationHint = formatPaginationHint(obj, options.responsePattern);
    const parts = [main, bulkSummary, paginationHint].filter(Boolean);
    return parts.join('\n');
  }

  return main;
}

// --- JSON ---

function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

// --- Table ---

function formatTable(data: unknown, options: FormatOptions): string {
  const obj = data as Record<string, unknown>;

  // Find the primary data array in the response
  const { rows, columns } = extractTableData(obj, options);

  if (rows.length === 0) {
    return chalk.dim('No results.');
  }

  const table = new Table({
    head: columns.map((c) => chalk.bold(c)),
    style: { head: [], border: [] },
  });

  for (const row of rows) {
    table.push(columns.map((col) => formatCellValue(getNestedValue(row, col))));
  }

  return table.toString();
}

// --- CSV ---

function formatCsv(data: unknown, options: FormatOptions): string {
  const obj = data as Record<string, unknown>;
  const { rows, columns } = extractTableData(obj, options);

  if (rows.length === 0) return '';

  const lines: string[] = [columns.join(',')];
  for (const row of rows) {
    lines.push(columns.map((col) => csvEscape(formatCellValue(getNestedValue(row, col)))).join(','));
  }
  return lines.join('\n');
}

function csvEscape(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

// --- Bulk summary ---

function formatBulkSummary(obj: Record<string, unknown>): string {
  if (typeof obj.successCount !== 'number' || typeof obj.failureCount !== 'number') {
    return '';
  }
  const parts: string[] = [];
  if (obj.successCount > 0) {
    parts.push(chalk.green(`${obj.successCount} succeeded`));
  }
  if (obj.failureCount > 0) {
    parts.push(chalk.red(`${obj.failureCount} failed`));
  }
  return parts.join(', ');
}

// --- Pagination hint ---

function formatPaginationHint(
  obj: Record<string, unknown>,
  pattern?: ResponsePattern,
): string {
  const pagination = obj.pagination as Record<string, unknown> | undefined;
  if (!pagination) return '';

  if (!pagination.hasMore) return '';

  if (pattern === 'paginated-page' && typeof pagination.nextPage === 'number') {
    return chalk.dim(`Use --page ${pagination.nextPage} to see more`);
  }

  if (pattern === 'paginated-offset' && typeof pagination.nextOffset === 'number') {
    return chalk.dim(`Use --offset ${pagination.nextOffset} to see more`);
  }

  if (pagination.hasMore) {
    return chalk.dim('More results available.');
  }

  return '';
}

// --- Helpers ---

/**
 * Known column configs for specific response types.
 * Falls back to auto-detection if no specific config is found.
 */
const TABLE_CONFIGS: Record<string, string[]> = {
  // Domain search results
  ud_domains_search: ['name', 'available', 'marketplace.status', 'pricing.formatted'],
  // Portfolio list
  ud_portfolio_list: ['name', 'status', 'expiresAt', 'autoRenewal'],
  // Domain get
  ud_domain_get: ['name', 'status', 'registryType', 'expiresAt'],
  // TLD list (spec returns string[], so extractTableData wraps them)
  ud_tld_list: ['tld'],
  // DNS records
  ud_dns_records_list: ['type', 'subName', 'values', 'ttl'],
  // Cart
  ud_cart_get: ['name', 'type', 'pricing.formatted'],
  // Contacts
  ud_contacts_list: ['id', 'firstName', 'lastName', 'email'],
  // Offers
  ud_offers_list: ['domainName', 'amount', 'status', 'createdAt'],
  // Leads
  ud_leads_list: ['domain', 'status', 'lastMessage', 'createdAt'],
  // Listings
  ud_listing_create: ['domain', 'success', 'listingId'],
  // Payment methods (spec returns savedCards array)
  ud_cart_get_payment_methods: ['id', 'brand', 'last4', 'expMonth', 'expYear', 'isDefault'],
};

function extractTableData(
  obj: Record<string, unknown>,
  options: FormatOptions,
): { rows: Record<string, unknown>[]; columns: string[] } {
  // Find the primary array — common keys: results, domains, tlds, records, items, contacts, offers, leads
  const arrayKeys = ['results', 'domains', 'tlds', 'records', 'items', 'contacts', 'offers', 'leads', 'messages', 'listings', 'savedCards'];
  let rows: Record<string, unknown>[] = [];

  for (const key of arrayKeys) {
    if (Array.isArray(obj[key]) && (obj[key] as unknown[]).length > 0) {
      const arr = obj[key] as unknown[];
      // Handle arrays of primitives (e.g., string[]) by wrapping them as objects
      if (typeof arr[0] !== 'object' || arr[0] === null) {
        rows = arr.map((v) => ({ [key.replace(/s$/, '')]: v }));
      } else {
        rows = arr as Record<string, unknown>[];
      }
      break;
    }
  }

  // If no array found, try to treat the whole response as a single row
  if (rows.length === 0 && typeof obj === 'object') {
    // Check if it's a simple key-value result (like cart url, checkout, etc.)
    const hasScalars = Object.values(obj).some(
      (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
    );
    if (hasScalars) {
      rows = [obj];
    }
  }

  if (rows.length === 0) return { rows: [], columns: [] };

  // Get column config
  const toolName = options.toolName ?? '';
  const configuredCols = TABLE_CONFIGS[toolName];

  if (configuredCols) {
    return { rows, columns: configuredCols };
  }

  // Auto-detect columns from first row
  const columns = autoDetectColumns(rows[0]);
  return { rows, columns };
}

function autoDetectColumns(row: Record<string, unknown>): string[] {
  const cols: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) continue; // skip nested objects
    if (cols.length >= 8) break; // cap at 8 columns for readability
    cols.push(key);
  }
  return cols;
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') return value ? chalk.green('Yes') : chalk.dim('No');
  if (Array.isArray(value)) return value.join(', ');
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Resolve a dotted path like "pricing.formatted" from a row object.
 * Patches Table extraction to support nested column references.
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return chalk.red(`Error: ${error.message}`);
  }
  return chalk.red(`Error: ${String(error)}`);
}
