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
  /** Show an operation-tracking hint after the API call completes. */
  showOperationHint?: boolean;
  /** Show a cart-add hint using the first available result from search. */
  showCartHint?: boolean;
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
  ud_domains_search: { showCartHint: true },
  ud_dns_record_add: { showOperationHint: true },
  ud_dns_record_update: { showOperationHint: true },
  ud_dns_record_remove: { showOperationHint: true },
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

/** Map marketplace source to the corresponding cart add subcommand. */
const SOURCE_TO_CART_CMD: Record<string, string> = {
  unstoppable_domains: 'registration',
  aftermarket: 'listed',
  afternic: 'afternic',
  sedo: 'sedo',
};

/**
 * Format a cart-add hint from domain search results.
 * Uses the first available domain to build a copy/paste command.
 */
export function formatCartHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const results = (obj.results ?? obj.domains) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(results) || results.length === 0) return '';

  // Find the first available domain
  const available = results.find((item) => item.available === true);
  if (!available) return '';

  const name = available.name as string | undefined;
  if (!name) return '';

  const marketplace = available.marketplace as Record<string, unknown> | undefined;
  const source = marketplace?.source as string | undefined;
  const subCmd = SOURCE_TO_CART_CMD[source ?? ''] ?? 'registration';

  return chalk.dim(`\nTo add to cart: ud cart add ${subCmd} ${name}`);
}
