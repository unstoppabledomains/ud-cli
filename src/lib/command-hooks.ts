/**
 * Declarative hook definitions for commands that need special behavior
 * beyond the standard API call (confirmations, OTP prompts, operation hints).
 */

import chalk from 'chalk';

export interface CommandHooks {
  /** Require --confirm flag or interactive prompt before executing. */
  requireConfirm?: {
    /** API param name to set when confirmed (e.g., 'confirmDeleteAll'). Omit if no API param needed. */
    paramName?: string;
    /** Warning message shown to the user. */
    message: string;
  };
  /** Prompt for a value interactively if the corresponding flag is not provided. */
  promptInput?: {
    /** CLI flag name (kebab-case, e.g., 'otp-code'). */
    flagName: string;
    /** API param name to set with the input value. */
    paramName: string;
    /** Prompt message shown to the user. */
    prompt: string;
    /** Regex to validate user input. */
    validate?: RegExp;
  };
  /** Transform the request body before sending (e.g., price conversion). */
  transformBody?: (body: Record<string, unknown>, opts: Record<string, unknown>) => Record<string, unknown>;
  /** Register a --price <dollars> option for this command. */
  priceOption?: boolean;
  /** Show an operation-tracking hint after the API call completes. */
  showOperationHint?: boolean;
  /** Show actionable hints when specific error codes appear in bulk results. */
  showFailureHints?: boolean;
  /** Show a cart-add hint using the first available result from search. */
  showCartHint?: boolean;
}

/**
 * Create a transformBody hook that converts --price (dollars) to priceInCents on each item.
 */
function makePriceTransformer(arrayKey: string): CommandHooks['transformBody'] {
  return (body, opts) => {
    const price = opts.price as string | undefined;
    if (price !== undefined) {
      const num = Number(price);
      if (Number.isNaN(num) || num < 0) {
        throw new Error(`Invalid --price value: "${price}". Must be a non-negative number (e.g., 99.99).`);
      }
      const cents = Math.round(num * 100);
      if (Array.isArray(body[arrayKey])) {
        for (const item of body[arrayKey] as Record<string, unknown>[]) {
          if (item.priceInCents === undefined) item.priceInCents = cents;
        }
      }
    }
    return body;
  };
}

const HOOKS: Record<string, CommandHooks> = {
  ud_dns_records_remove_all: {
    requireConfirm: {
      paramName: 'confirmDeleteAll',
      message: 'This will delete ALL DNS records for the specified domain(s). Are you sure?',
    },
    showOperationHint: true,
  },
  ud_domain_remove_lander: {
    requireConfirm: {
      message: 'This will remove the AI lander for the specified domain(s). Are you sure?',
    },
    showOperationHint: true,
  },
  ud_domain_push: {
    promptInput: {
      flagName: 'otp-code',
      paramName: 'otpCode',
      prompt: 'Enter 6-digit OTP code: ',
      validate: /^\d{6}$/,
    },
  },
  ud_cart_checkout: {
    requireConfirm: {
      message: 'Are you sure you want to complete this purchase? Review your cart with: ud cart get',
    },
  },
  ud_listing_cancel: {
    requireConfirm: {
      message: 'This will cancel the specified listing(s). Are you sure?',
    },
  },
  ud_listing_create: {
    priceOption: true,
    transformBody: makePriceTransformer('domains'),
  },
  ud_listing_update: {
    priceOption: true,
    transformBody: makePriceTransformer('listings'),
  },
  ud_domains_search: { showCartHint: true },
  ud_dns_record_add: { showOperationHint: true, showFailureHints: true },
  ud_dns_record_update: { showOperationHint: true, showFailureHints: true },
  ud_dns_record_remove: { showOperationHint: true, showFailureHints: true },
  ud_dns_nameservers_set_custom: { showOperationHint: true },
  ud_dns_nameservers_set_default: { showOperationHint: true },
  ud_dns_hosting_add: { showOperationHint: true },
  ud_dns_hosting_remove: { showOperationHint: true },
};

/**
 * Get hooks for a given tool name. Returns undefined if no hooks defined.
 */
export function getHooks(toolName: string): CommandHooks | undefined {
  return HOOKS[toolName];
}

/**
 * Format a hint about async DNS operations from an API response.
 * Scans result.results[] for items with operationId and collects unique domains.
 */
export function formatOperationHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const results = obj.results as Record<string, unknown>[] | undefined;
  if (!Array.isArray(results)) return '';

  const domains = new Set<string>();
  let hasOps = false;

  for (const item of results) {
    if (item.operationId !== undefined) {
      hasOps = true;
      if (typeof item.domain === 'string') {
        domains.add(item.domain);
      }
    }
  }

  if (!hasOps) return '';

  const domainList = [...domains].join(' ');
  const trackCmd = domainList
    ? `ud domains operations ${domainList}`
    : 'ud domains operations <domain>';

  return chalk.dim(`Tip: DNS changes are async. Track with: ${trackCmd}`);
}

/**
 * Format actionable hints for known error codes in bulk DNS results.
 * Scans result.results[] for error codes and returns a user-friendly suggestion.
 */
export function formatFailureHints(toolName: string, result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const results = obj.results as Record<string, unknown>[] | undefined;
  if (!Array.isArray(results)) return '';

  const errorCodes = new Set<string>();
  for (const item of results) {
    if (item.success) continue;
    const err = item.error;
    if (typeof err === 'string') {
      try {
        const parsed = JSON.parse(err) as { code?: string };
        if (parsed.code) errorCodes.add(parsed.code);
      } catch {
        // error is not JSON — skip
      }
    } else if (err && typeof err === 'object') {
      const code = (err as Record<string, unknown>).code;
      if (typeof code === 'string') errorCodes.add(code);
    }
  }

  if (errorCodes.size === 0) return '';

  const hints: string[] = [];

  if (errorCodes.has('NO_CHANGE') && toolName === 'ud_dns_record_add') {
    hints.push('Records already exist. Use --upsert-mode append to add alongside existing values, or --upsert-mode replace to overwrite them.');
  } else if (errorCodes.has('NO_CHANGE')) {
    hints.push('No changes would occur. The records may already match the requested state.');
  }

  if (hints.length === 0) return '';
  return chalk.yellow(`Hint: ${hints.join('\n')}`);
}

/** Map marketplace source to the corresponding cart add subcommand. */
export const SOURCE_TO_CART_CMD: Record<string, string> = {
  unstoppable_domains: 'registration',
  aftermarket: 'listed',
  afternic: 'afternic',
  sedo: 'sedo',
};

/**
 * Format a cart-add hint from domain search results.
 * Shows one example per marketplace source type found in the results.
 */
export function formatCartHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const results = (obj.results ?? obj.domains) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(results) || results.length === 0) return '';

  // Collect one example per marketplace source type
  const seenSources = new Map<string, { name: string; subCmd: string }>();
  for (const item of results) {
    if (item.available !== true) continue;
    const name = item.name as string | undefined;
    if (!name) continue;
    const marketplace = item.marketplace as Record<string, unknown> | undefined;
    const source = marketplace?.source as string | undefined;
    const subCmd = SOURCE_TO_CART_CMD[source ?? ''] ?? 'registration';
    if (!seenSources.has(subCmd)) {
      seenSources.set(subCmd, { name, subCmd });
    }
  }

  if (seenSources.size === 0) return '';

  const lines = [...seenSources.values()].map(
    ({ name, subCmd }) => `  ud cart add ${subCmd} ${name}`,
  );
  return chalk.dim(`\nTo add to cart:\n${lines.join('\n')}`);
}
