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
  /** User-specified columns via --fields flag. Overrides TABLE_CONFIGS. */
  fields?: string[];
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

  // Check for detail view (single-item response with detail config)
  // Skip detail view when --fields is specified — user wants explicit columns
  const detailConfig = !options.fields ? DETAIL_CONFIGS[options.toolName ?? ''] : undefined;
  if (detailConfig) {
    if (detailConfig.source === 'response') {
      // Response-level detail: render the top-level response object directly
      return formatDetail(obj, detailConfig);
    }
    // Item-level detail: only for single-item responses
    const { rows } = extractTableData(obj, options);
    if (rows.length === 1) {
      return formatDetail(rows[0], detailConfig);
    }
    // Multiple items — fall through to normal table
  }

  // Find the primary data array in the response
  const { rows, columns } = extractTableData(obj, options);

  if (rows.length === 0) {
    return chalk.dim('No results.');
  }

  const table = new Table({
    head: columns.map((c) => chalk.bold(formatHeaderName(c))),
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

  const lines: string[] = [columns.map(formatHeaderName).join(',')];
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

  // Build context line: "Page 1 of 3 (150 total)" or "Showing 20 of 150"
  const parts: string[] = [];
  const context = formatPaginationContext(pagination);
  if (context) parts.push(chalk.dim(context));

  if (!pagination.hasMore) return parts.join('\n');

  // Compute next page/offset for the actionable hint
  if (pattern === 'paginated-page') {
    const nextPage = typeof pagination.nextPage === 'number'
      ? pagination.nextPage
      : typeof pagination.page === 'number' ? pagination.page + 1 : undefined;
    if (nextPage !== undefined) {
      parts.push(chalk.dim(`Next page: --page ${nextPage}`));
      return parts.join('\n');
    }
  }

  if (pattern === 'paginated-offset') {
    const nextOffset = typeof pagination.nextOffset === 'number'
      ? pagination.nextOffset
      : undefined;
    if (nextOffset !== undefined) {
      parts.push(chalk.dim(`Next page: --offset ${nextOffset}`));
      return parts.join('\n');
    }
  }

  parts.push(chalk.dim('More results available.'));
  return parts.join('\n');
}

function formatPaginationContext(pagination: Record<string, unknown>): string {
  const page = pagination.page as number | undefined;
  const totalPages = pagination.totalPages as number | undefined;
  const total = pagination.total as number | undefined;

  if (typeof page === 'number' && typeof totalPages === 'number') {
    const suffix = typeof total === 'number' ? ` (${total} total)` : '';
    return `Page ${page} of ${totalPages}${suffix}`;
  }

  if (typeof page === 'number' && typeof total === 'number') {
    return `Page ${page} (${total} total)`;
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
  // Domain get (multi-domain fallback; single domain uses DETAIL_CONFIGS)
  ud_domain_get: ['domain', 'extension', 'lifecycle.expiresAt', 'lifecycle.autoRenewal.status', 'tags'],
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

/**
 * Detail view configs for rich responses.
 * - source 'item' (default): detail view for a single item from the primary array
 * - source 'response': detail view of the entire top-level response object
 * Sub-tables render nested arrays as horizontal tables below the key-value sections.
 */
interface DetailField {
  label: string;
  path: string;
}

interface DetailSection {
  title: string;
  fields: DetailField[];
}

interface SubTableConfig {
  title: string;
  arrayPath: string;
  columns: string[];
}

interface DetailConfig {
  source?: 'item' | 'response';
  sections: DetailSection[];
  subTables?: SubTableConfig[];
}

const DETAIL_CONFIGS: Record<string, DetailConfig> = {
  ud_domain_get: {
    sections: [
      {
        title: 'General',
        fields: [
          { label: 'Domain', path: 'domain' },
          { label: 'Extension', path: 'extension' },
          { label: 'Purchased', path: 'lifecycle.purchasedAt' },
          { label: 'Expires', path: 'lifecycle.expiresAt' },
          { label: 'Transfer Status', path: 'lifecycle.transferStatus' },
          { label: 'Externally Owned', path: 'lifecycle.isExternallyOwned' },
          { label: 'Reverse Resolution', path: 'lifecycle.reverse' },
          { label: 'Tags', path: 'tags' },
        ],
      },
      {
        title: 'Renewal',
        fields: [
          { label: 'Auto-Renewal', path: 'lifecycle.autoRenewal.status' },
          { label: 'Next Renewal', path: 'lifecycle.autoRenewal.expiresAt' },
          { label: 'Eligible', path: 'lifecycle.renewal.isEligible' },
          { label: 'Price Per Year', path: 'lifecycle.renewal.pricePerYearFormatted' },
        ],
      },
      {
        title: 'Flags',
        fields: [
          { label: 'Transfer Lock', path: 'flags.DNS_TRANSFER_OUT.status' },
          { label: 'WHOIS Privacy', path: 'flags.DNS_WHOIS_PROXY.status' },
          { label: 'DNS Resolution', path: 'flags.DNS_RESOLUTION.status' },
          { label: 'DNS Updates', path: 'flags.DNS_UPDATE.status' },
          { label: 'Tokenization', path: 'flags.DNS_UNS_TOKENIZATION.status' },
        ],
      },
      {
        title: 'DNS',
        fields: [
          { label: 'Nameserver Mode', path: 'dns.nameservers.status' },
          { label: 'Nameservers', path: 'dns.nameservers.nameservers' },
          { label: 'DNSSEC Enabled', path: 'dns.dnssec.enabled' },
          { label: 'DNSSEC Valid', path: 'dns.dnssec.valid' },
        ],
      },
      {
        title: 'Marketplace',
        fields: [
          { label: 'Listing Status', path: 'marketplace.listing.status' },
          { label: 'Listing Price', path: 'marketplace.listing.price' },
          { label: 'Listing Views', path: 'marketplace.listing.views' },
          { label: 'Offers', path: 'marketplace.offersCount' },
          { label: 'Leads', path: 'marketplace.leadsCount' },
          { label: 'Watchlist', path: 'marketplace.watchlistCount' },
        ],
      },
    ],
    subTables: [
      { title: 'Pending Operations', arrayPath: 'pendingOperations', columns: ['id', 'type', 'status', 'createdAt'] },
    ],
  },

  ud_cart_get: {
    source: 'response',
    sections: [
      {
        title: 'Summary',
        fields: [
          { label: 'Items', path: 'itemCount' },
          { label: 'Total Value', path: 'pricing.totalOrderValueFormatted' },
          { label: 'Total Discounts', path: 'totalDiscountsFormatted' },
          { label: 'Amount Due', path: 'pricing.totalAmountDueFormatted' },
        ],
      },
      {
        title: 'Pricing',
        fields: [
          { label: 'Subtotal', path: 'pricing.preTaxAmountDueFormatted' },
          { label: 'Sales Tax', path: 'pricing.salesTaxFormatted' },
          { label: 'Tax Rate', path: 'pricing.taxRate' },
          { label: 'Promo Credits', path: 'pricing.promoCreditsUsedFormatted' },
          { label: 'Store Credits', path: 'pricing.storeCreditsUsedFormatted' },
          { label: 'Account Balance', path: 'pricing.accountBalanceUsedFormatted' },
          { label: 'Total Due', path: 'pricing.totalAmountDueFormatted' },
        ],
      },
    ],
    subTables: [
      { title: 'Items', arrayPath: 'items', columns: ['domain', 'productType', 'originalPriceFormatted', 'discountAmountFormatted'] },
      { title: 'Discounts', arrayPath: 'discounts', columns: ['title', 'type', 'amountFormatted', 'code'] },
    ],
  },

  ud_dns_records_list: {
    source: 'response',
    sections: [
      {
        title: 'DNS Status',
        fields: [
          { label: 'Domain', path: 'domain' },
          { label: 'Provider', path: 'dnsStatus.provider' },
          { label: 'Configured', path: 'dnsStatus.configured' },
          { label: 'Status', path: 'dnsStatus.message' },
        ],
      },
    ],
    subTables: [
      { title: 'Records', arrayPath: 'records', columns: ['type', 'subName', 'values', 'ttl', 'readonly'] },
    ],
  },

  ud_domain_pending_operations: {
    sections: [
      {
        title: 'Domain',
        fields: [
          { label: 'Domain', path: 'domain' },
          { label: 'Has Pending Operations', path: 'hasPendingOperations' },
        ],
      },
    ],
    subTables: [
      { title: 'Operations', arrayPath: 'operations', columns: ['id', 'type', 'status', 'createdAt', 'updatedAt', 'errorCode'] },
    ],
  },
};

function formatDetail(obj: Record<string, unknown>, config: DetailConfig): string {
  const parts: string[] = [];

  for (const section of config.sections) {
    const rows: [string, string][] = [];
    for (const field of section.fields) {
      const value = getNestedValue(obj, field.path);
      if (value === null || value === undefined) continue;
      rows.push([field.label, formatDetailValue(value)]);
    }
    if (rows.length === 0) continue;

    parts.push('');
    parts.push(chalk.bold.underline(section.title));
    const table = new Table({
      style: { head: [], border: [], 'padding-left': 1, 'padding-right': 1 },
    });
    for (const [label, val] of rows) {
      table.push({ [chalk.dim(label)]: val });
    }
    parts.push(table.toString());
  }

  // Render sub-tables
  if (config.subTables) {
    for (const sub of config.subTables) {
      const arr = getNestedValue(obj, sub.arrayPath) as Record<string, unknown>[] | undefined;
      if (!Array.isArray(arr) || arr.length === 0) continue;

      parts.push('');
      parts.push(chalk.bold.underline(sub.title));
      const subTable = new Table({
        head: sub.columns.map((c) => chalk.bold(formatHeaderName(c))),
        style: { head: [], border: [] },
      });
      for (const item of arr) {
        subTable.push(sub.columns.map((col) => formatCellValue(getNestedValue(item, col), true)));
      }
      parts.push(subTable.toString());
    }
  }

  return parts.join('\n');
}

/**
 * Format a value for the detail view with enhanced readability.
 */
function formatDetailValue(value: unknown): string {
  if (value === null || value === undefined) return '';

  // Flag statuses: ENABLED/DISABLED → colored
  if (value === 'ENABLED') return chalk.green('Enabled');
  if (value === 'DISABLED') return chalk.dim('Disabled');

  return formatCellValue(value, true);
}

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

  // Priority: user --fields > TABLE_CONFIGS > auto-detect
  if (options.fields && options.fields.length > 0) {
    return { rows, columns: options.fields };
  }

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
 * Convert a column key (e.g., "autoRenewal.status", "expiresAt") into a
 * human-readable header: "Auto Renewal Status", "Expires At".
 * Splits on dots, expands camelCase, and title-cases each word.
 */
function formatHeaderName(key: string): string {
  return key
    .split('.')
    .map((segment) =>
      segment
        // Insert space before uppercase letters in camelCase
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // Capitalize first letter of each word
        .replace(/\b\w/g, (c) => c.toUpperCase()),
    )
    .join(' ');
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

/**
 * Return known field paths for a given tool.
 * `defaults` are the TABLE_CONFIGS columns; `all` merges DETAIL_CONFIGS and spec response fields.
 * Pass `responseFields` from the parsed OpenAPI spec for complete discovery.
 */
export function getKnownFields(
  toolName: string,
  responseFields?: string[],
): { defaults: string[]; all: string[] } | null {
  const tableColumns = TABLE_CONFIGS[toolName];
  if (!tableColumns && (!responseFields || responseFields.length === 0)) return null;

  const defaults = tableColumns ?? [];
  const allFields = new Set(defaults);

  // Merge detail config paths
  const detailConfig = DETAIL_CONFIGS[toolName];
  if (detailConfig) {
    for (const section of detailConfig.sections) {
      for (const field of section.fields) {
        allFields.add(field.path);
      }
    }
  }

  // Merge spec response fields
  if (responseFields) {
    for (const field of responseFields) {
      allFields.add(field);
    }
  }

  return { defaults, all: [...allFields] };
}

/**
 * Format the --fields list output for a command.
 * Pass `responseFields` from the parsed OpenAPI spec for complete discovery.
 */
export function formatFieldsList(
  toolName: string,
  commandName: string,
  responseFields?: string[],
): string {
  const known = getKnownFields(toolName, responseFields);
  const lines: string[] = [];

  if (known && known.all.length > 0) {
    lines.push(chalk.bold(`Available fields for ${commandName}:`));
    if (known.defaults.length > 0) {
      lines.push('');
      lines.push(chalk.dim('  Default columns (shown without --fields):'));
      for (const col of known.defaults) {
        lines.push(`    ${col}`);
      }
    }
    const extra = known.all.filter((f) => !known.defaults.includes(f));
    if (extra.length > 0) {
      lines.push('');
      lines.push(chalk.dim('  Additional fields:'));
      for (const field of extra) {
        lines.push(`    ${field}`);
      }
    }
  } else {
    lines.push(chalk.dim(`No pre-configured fields for ${commandName}.`));
    lines.push('');
    lines.push(chalk.dim('  Tip: Use --format json to see all available response fields.'));
  }

  return lines.join('\n');
}

export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return chalk.red(`Error: ${error.message}`);
  }
  return chalk.red(`Error: ${String(error)}`);
}
