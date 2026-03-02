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
    table.push(columns.map((col) => formatCellValue(getNestedValue(row, col), true)));
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
    // useColor=false: ANSI escape codes break CSV consumers (cut, awk, spreadsheets)
    lines.push(columns.map((col) => csvEscape(formatCellValue(getNestedValue(row, col), false))).join(','));
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
  ud_portfolio_list: ['name', 'expiresAt', 'autoRenewal.status', 'tags'],
  // Domain get
  ud_domain_get: ['domain', 'extension', 'lifecycle.expiresAt', 'lifecycle.transferStatus', 'tags'],
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

  // --- DNS mutation responses ---
  ud_dns_record_add: ['domain', 'success', 'operationId', 'error'],
  ud_dns_record_update: ['domain', 'success', 'operationId', 'error'],
  ud_dns_record_remove: ['domain', 'success', 'operationId', 'error'],
  ud_dns_records_remove_all: ['domain', 'success', 'operationId', 'error'],
  ud_dns_nameservers_set_custom: ['domain', 'success', 'nameservers', 'error'],
  ud_dns_nameservers_set_default: ['domain', 'success', 'nameservers', 'error'],
  ud_dns_hosting_add: ['domain', 'success', 'config.type', 'error'],
  ud_dns_hosting_remove: ['domain', 'success', 'subName', 'deletedAll', 'error'],

  // Nameserver list (single-object response — rendered as single row)
  ud_dns_nameservers_list: ['domain', 'nameservers', 'isUsingDefaultNameservers'],
  // Hosting list (array in "configs" key)
  ud_dns_hosting_list: ['type', 'subName', 'targetUrl', 'status'],

  // --- Domain lifecycle ---
  ud_domain_pending_operations: ['domain', 'hasPendingOperations'],
  ud_domain_auto_renewal_update: ['domain', 'success', 'error'],
  ud_domain_tags_add: ['domain', 'success', 'tagsApplied', 'error'],
  ud_domain_tags_remove: ['domain', 'success', 'tagsRemoved', 'error'],
  ud_domain_flags_update: ['domain', 'success', 'updatedFlags', 'error'],
  ud_domain_generate_lander: ['domain', 'success', 'jobId', 'error'],
  ud_domain_lander_status: ['domain', 'status', 'hostingType'],
  ud_domain_remove_lander: ['domain', 'success', 'operationId', 'error'],
  ud_domain_push: ['success', 'message'],
};

function extractTableData(
  obj: Record<string, unknown>,
  options: FormatOptions,
): { rows: Record<string, unknown>[]; columns: string[] } {
  const isTable = options.format === 'table';
  // Find the primary array — common keys: results, domains, tlds, records, items, contacts, offers, leads
  const arrayKeys = ['results', 'domains', 'tlds', 'records', 'items', 'contacts', 'offers', 'leads', 'messages', 'listings', 'savedCards', 'configs', 'pushedDomains', 'failedDomains'];
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

  // Auto-detect columns from first row (cap at 8 only for table readability)
  const columns = autoDetectColumns(rows[0], isTable ? 8 : Infinity);
  return { rows, columns };
}

function autoDetectColumns(row: Record<string, unknown>, maxCols: number): string[] {
  const cols: string[] = [];
  for (const [key, value] of Object.entries(row)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'object' && !Array.isArray(value)) continue; // skip nested objects
    if (cols.length >= maxCols) break;
    cols.push(key);
  }
  return cols;
}

function formatCellValue(value: unknown, useColor = true): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'boolean') {
    return useColor
      ? (value ? chalk.green('Yes') : chalk.dim('No'))
      : (value ? 'true' : 'false');
  }
  // Detect ISO date strings and format consistently
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
    const d = new Date(value);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    }
  }

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
