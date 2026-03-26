/**
 * Declarative hook definitions for commands that need special behavior
 * beyond the standard API call (confirmations, OTP prompts, operation hints).
 */

import chalk from 'chalk';
import { join } from 'node:path';
import { openInBrowser } from './magic-link.js';

/** Context passed to preAction hooks for dependency injection. */
export interface PreActionContext {
  callAction: (toolName: string, params: Record<string, unknown>) => Promise<unknown>;
  createMagicLinkUrl: (url: string) => Promise<string>;
  promptInput: (message: string, opts?: { validate?: RegExp }) => Promise<string>;
  body: Record<string, unknown>;
}

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
  transformBody?: (body: Record<string, unknown>, opts: Record<string, unknown>) => Record<string, unknown> | Promise<Record<string, unknown>>;
  /** Register a --price <dollars> option for this command. */
  priceOption?: boolean;
  /** Show an operation-tracking hint after the API call completes. */
  showOperationHint?: boolean;
  /** Show actionable hints when specific error codes appear in bulk results. */
  showFailureHints?: boolean;
  /** Show a cart-add hint using the first available result from search. */
  showCartHint?: boolean;
  /** Post-action hint shown after a successful API call. Static string or dynamic function. */
  postActionHint?: string | ((result: unknown) => string);
  /** Response field paths containing URLs to wrap in magic links for session handoff. */
  magicLinkFields?: string[];
  /** Custom result formatter that replaces the default table/detail output. */
  formatResult?: (result: unknown) => string;
  /** Async pre-action check that runs before confirmation. Can abort the command. */
  preAction?: (ctx: PreActionContext) => Promise<{ message?: string; abort?: boolean } | void>;
  /** Additional Commander options to register on the command (e.g., --html-file, --output-dir). */
  additionalOptions?: Array<{ flags: string; description: string }>;
  /** Async post-action hook that runs after API call, before formatting.
   *  Can perform side effects (e.g., file writing) and return a modified result for display. */
  postAction?: (result: unknown, opts: Record<string, unknown>) => Promise<unknown>;
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

// ---------------------------------------------------------------------------
// Post-action hint helpers (must be defined before HOOKS)
// ---------------------------------------------------------------------------

/** Extract the first domain name from common response shapes. */
function extractFirstDomain(result: unknown): string | undefined {
  if (!result || typeof result !== 'object') return undefined;
  const obj = result as Record<string, unknown>;

  // Bulk results: results[].domain or results[].domainName
  const results = obj.results as Record<string, unknown>[] | undefined;
  if (Array.isArray(results) && results.length > 0) {
    const item = results[0];
    if (typeof item.domain === 'string') return item.domain;
    if (typeof item.domainName === 'string') return item.domainName;
  }

  // Portfolio: domains[].name or domains[].domain
  const domains = obj.domains as Record<string, unknown>[] | undefined;
  if (Array.isArray(domains) && domains.length > 0) {
    const item = domains[0];
    if (typeof item.name === 'string') return item.name;
    if (typeof item.domain === 'string') return item.domain;
  }

  // Single domain field
  if (typeof obj.domain === 'string') return obj.domain;

  return undefined;
}

export const VIEW_CART_HINT = chalk.dim('\nTip: View your cart with: ud cart list');
export const CHECKOUT_HINT = chalk.dim('\nTip: Ready to buy? Run: ud cart checkout');
const ADD_PAYMENT_HINT = chalk.dim('\nTip: Add a payment method: ud cart payment-methods add');
const VERIFY_PORTFOLIO_HINT = chalk.dim('\nTip: Verify your portfolio: ud domains list');
const OFFERS_LIST_HINT = chalk.dim('\nTip: View your offers: ud marketplace offers list');

/** cart list → checkout + payment method tips */
function formatCartViewHint(_result: unknown): string {
  return CHECKOUT_HINT + ADD_PAYMENT_HINT;
}

/**
 * Checkout pre-action: verify payment methods and ICANN contacts before proceeding.
 *
 * 1. Payment check: abort with magic link if no cards/credits
 * 2. Contact check: prompt for inline creation (TTY) or abort with hint (non-TTY)
 *
 * Fail-open design: if any check fails, checkout proceeds normally so users
 * are never blocked by a pre-check error.
 */
async function checkoutPreAction(
  ctx: PreActionContext,
): Promise<{ message?: string; abort?: boolean } | void> {
  try {
    const result = await ctx.callAction('ud_cart_get_payment_methods', {}) as Record<string, unknown>;
    const savedCards = result.savedCards as unknown[] | undefined;
    const summary = result.summary as Record<string, unknown> | undefined;
    const totalCredits = (summary?.totalCredits as number) ?? 0;

    const hasCards = Array.isArray(savedCards) && savedCards.length > 0;
    const hasCredits = totalCredits > 0;

    if (!hasCards && !hasCredits) {
      // No payment method or credits — redirect to browser checkout
      let checkoutLine = '';
      try {
        const urlResult = await ctx.callAction('ud_cart_get_url', {}) as Record<string, unknown>;
        const checkoutUrl = urlResult.checkoutUrl as string | undefined;
        if (checkoutUrl) {
          const magicUrl = await ctx.createMagicLinkUrl(checkoutUrl);
          checkoutLine = `\n\n  ${magicUrl}`;
          openInBrowser(magicUrl);
        }
      } catch {
        // Fall through without checkout link
      }

      return {
        abort: true,
        message: chalk.yellow('No saved payment method or account credits found.') +
          '\nCheckout requires a visit to the website.' + checkoutLine +
          chalk.dim('\n\nTo skip this step next time, save a card: ud cart payment-methods add'),
      };
    }
  } catch {
    // Fail-open: if the pre-check fails (network, auth, etc.), let checkout proceed normally
  }

  // --- ICANN contact check ---
  try {
    const contactResult = await ctx.callAction('ud_contacts_list', {}) as Record<string, unknown>;
    const contacts = contactResult.contacts as unknown[] | undefined;

    if (!Array.isArray(contacts) || contacts.length === 0) {
      if (!process.stdin.isTTY) {
        return {
          abort: true,
          message: chalk.yellow('No ICANN contact found.') +
            '\nDNS domains (.com, .org, etc.) require contact information for registration.' +
            chalk.dim('\n\nCreate a contact first: ud domains contacts create'),
        };
      }

      // Interactive: prompt for inline contact creation
      const { promptContactCreation } = await import('./contact.js');
      const created = await promptContactCreation(
        { promptInput: ctx.promptInput, callAction: ctx.callAction },
        contactResult.accountEmailHint as string | undefined,
      );

      if (!created) {
        return {
          abort: true,
          message: chalk.yellow('ICANN contact is required for DNS domain checkout.') +
            chalk.dim('\nCreate one with: ud domains contacts create'),
        };
      }
    }
  } catch {
    // Fail-open: let checkout proceed (API will catch missing contact)
  }
}

/**
 * Pre-action for `ud domains contacts create`: run interactive prompts in TTY mode.
 * In non-TTY mode, falls through to normal CLI-flag handling.
 */
async function contactCreatePreAction(
  ctx: PreActionContext,
): Promise<{ message?: string; abort?: boolean } | void> {
  // Skip interactive prompts if CLI params were provided or non-TTY
  const hasParams = Object.keys(ctx.body).length > 0;
  if (!process.stdin.isTTY || hasParams) return;

  const { promptContactCreation } = await import('./contact.js');
  const created = await promptContactCreation(
    { promptInput: ctx.promptInput, callAction: ctx.callAction },
    undefined,
    { skipHeader: true },
  );

  if (created) {
    return { abort: true, message: chalk.dim('\nTip: Check out your cart: ud cart checkout') };
  }

  return { abort: true, message: 'Contact creation cancelled.' };
}

/** domains list → get details */
function formatPortfolioNextHint(result: unknown): string {
  const domain = extractFirstDomain(result);
  if (!domain) return '';
  return chalk.dim(`\nTip: Get full details: ud domains get ${domain}`);
}

/** domains get → manage DNS */
function formatDomainDetailHint(result: unknown): string {
  const domain = extractFirstDomain(result);
  if (!domain) return '';
  return chalk.dim(`\nTip: Manage DNS records: ud domains dns records show ${domain}`);
}

/** Generic mutation → verify with domains get */
function formatVerifyDomainHint(result: unknown): string {
  const domain = extractFirstDomain(result);
  if (!domain) return '';
  return chalk.dim(`\nTip: Verify changes: ud domains get ${domain}`);
}

/** checkout → view purchased domains */
function formatPostCheckoutHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const summary = obj.summary as Record<string, unknown> | undefined;
  const domains = summary?.domains as string[] | undefined;
  if (!Array.isArray(domains) || domains.length === 0) return '';
  return chalk.dim(`\nTip: View your new domains: ud domains get ${domains.join(' ')}`);
}

/** dns records show → add a record */
function formatDnsRecordsHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const domain = typeof obj.domain === 'string' ? obj.domain : undefined;
  const domainArg = domain ? ` ${domain}` : '';
  return chalk.dim(`\nTip: Add a record: ud domains dns records add${domainArg} --type A --value 1.2.3.4`);
}

/** offers list → respond to an offer */
function formatOfferRespondHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const offers = (obj.offers ?? obj.results) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(offers) || offers.length === 0) return '';
  const id = offers[0].id;
  const idStr = id != null ? String(id) : '<id>';
  return chalk.dim(`\nTip: Respond to an offer:\n  ud marketplace offers respond --offer-id ${idStr} --action accept`);
}

/** lead get (open) → send a message */
function formatLeadOpenHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const conversation = obj.conversation as Record<string, unknown> | undefined;
  const id = conversation?.id;
  const idStr = id != null ? String(id) : '<id>';
  return chalk.dim(`\nTip: Send a message:\n  ud marketplace leads messages send --conversation-id ${idStr} --content "Your message"`);
}

/** lead messages list → reply */
function formatLeadReplyHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const id = obj.conversationId;
  const idStr = id != null ? String(id) : '<id>';
  return chalk.dim(`\nTip: Reply to this conversation:\n  ud marketplace leads messages send --conversation-id ${idStr} --content "Your reply"`);
}

/** lead message send → view conversation */
function formatViewConversationHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const id = obj.conversationId;
  const idStr = id != null ? String(id) : '<id>';
  return chalk.dim(`\nTip: View conversation: ud marketplace leads messages list --conversation-id ${idStr}`);
}

/** lander generate → check status */
function formatLanderCheckHint(result: unknown): string {
  const domain = extractFirstDomain(result);
  if (!domain) return '';
  return chalk.dim(`\nTip: Check lander status: ud domains hosting landers show ${domain}`);
}

/** payment-methods add → browser-friendly message instead of raw URL table */
function formatPaymentMethodResult(result: unknown): string {
  const url = (result && typeof result === 'object')
    ? (result as Record<string, unknown>).url as string | undefined
    : undefined;

  const lines: string[] = [
    chalk.green('Opening payment method setup in your browser...'),
  ];

  if (url) {
    lines.push(`\n\n  ${url}\n`);
  }

  lines.push(chalk.dim('\nOnce saved, check out from the CLI: ud cart checkout'));

  return lines.join('');
}

/** operations show → conditional next step */
function formatOperationsNextHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';
  const obj = result as Record<string, unknown>;
  const summary = obj.summary as Record<string, unknown> | undefined;
  const pendingDomains = summary?.domainsWithPending as string[] | undefined;

  if (Array.isArray(pendingDomains) && pendingDomains.length > 0) {
    return chalk.dim(`\nTip: Operations still pending. Re-check with: ud domains operations show ${pendingDomains.join(' ')}`);
  }

  const domain = extractFirstDomain(result);
  if (!domain) return '';
  return chalk.dim(`\nTip: All operations complete. Verify DNS: ud domains dns records show ${domain}`);
}

// ---------------------------------------------------------------------------
// Hooks registry
// ---------------------------------------------------------------------------

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
    postActionHint: VERIFY_PORTFOLIO_HINT,
  },
  ud_cart_checkout: {
    requireConfirm: {
      message: 'Are you sure you want to complete this purchase? Review your cart with: ud cart list',
    },
    postActionHint: formatPostCheckoutHint,
    preAction: checkoutPreAction,
  },
  ud_listing_cancel: {
    requireConfirm: {
      message: 'This will cancel the specified listing(s). Are you sure?',
    },
    postActionHint: formatVerifyDomainHint,
  },
  ud_listing_create: {
    priceOption: true,
    transformBody: makePriceTransformer('domains'),
    postActionHint: formatVerifyDomainHint,
  },
  ud_listing_update: {
    priceOption: true,
    transformBody: makePriceTransformer('listings'),
    postActionHint: formatVerifyDomainHint,
  },
  ud_cart_get: { postActionHint: formatCartViewHint },
  ud_cart_get_url: { magicLinkFields: ['checkoutUrl'] },
  ud_cart_add_payment_method_url: { magicLinkFields: ['url'], formatResult: formatPaymentMethodResult },
  ud_contact_create: { preAction: contactCreatePreAction },
  ud_cart_get_payment_methods: { postActionHint: ADD_PAYMENT_HINT },
  ud_cart_remove: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_domain_registration: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_domain_listed: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_domain_afternic: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_domain_sedo: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_domain_renewal: { postActionHint: VIEW_CART_HINT },
  ud_cart_add_ai_credits: { postActionHint: VIEW_CART_HINT },
  ud_ai_credits_get: {
    postActionHint: (result: unknown) => {
      if (!result || typeof result !== 'object') return '';
      const obj = result as Record<string, unknown>;
      const parts: string[] = [];
      const hint = obj.hint as string | undefined;
      if (hint) parts.push(chalk.dim(`\n${hint}`));
      parts.push(chalk.dim('\nTip: Add credits to cart: ud cart add ai-credits --tier-size 25'));
      return parts.join('');
    },
  },
  // Portfolio & domain management
  ud_portfolio_list: { postActionHint: formatPortfolioNextHint },
  ud_domain_get: { postActionHint: formatDomainDetailHint },
  ud_domain_tags_add: { postActionHint: formatVerifyDomainHint },
  ud_domain_tags_remove: { postActionHint: formatVerifyDomainHint },
  ud_domain_flags_update: { postActionHint: formatVerifyDomainHint },
  ud_domain_auto_renewal_update: { postActionHint: formatVerifyDomainHint },
  // DNS
  ud_dns_records_list: { postActionHint: formatDnsRecordsHint },
  ud_domain_pending_operations: { postActionHint: formatOperationsNextHint },
  // Marketplace leads
  ud_leads_list: { postActionHint: formatLeadMessagesHint },
  ud_lead_get: { postActionHint: formatLeadOpenHint },
  ud_lead_messages_list: { postActionHint: formatLeadReplyHint },
  ud_lead_message_send: { postActionHint: formatViewConversationHint },
  // Marketplace offers
  ud_offers_list: { postActionHint: formatOfferRespondHint },
  ud_offer_respond: { postActionHint: OFFERS_LIST_HINT },
  // Landers
  ud_domain_generate_lander: {
    postActionHint: (result: unknown) => {
      if (!result || typeof result !== 'object') return formatLanderCheckHint(result);
      const obj = result as Record<string, unknown>;
      const purchaseHint = obj.purchaseHint as string | undefined;
      if (purchaseHint) {
        return chalk.yellow(`\n${purchaseHint}`) + formatLanderCheckHint(result);
      }
      return formatLanderCheckHint(result);
    },
  },
  // Search & DNS ops
  ud_domains_search: { showCartHint: true },
  ud_dns_record_add: { showOperationHint: true, showFailureHints: true },
  ud_dns_record_update: { showOperationHint: true, showFailureHints: true },
  ud_dns_record_remove: { showOperationHint: true, showFailureHints: true },
  ud_dns_nameservers_set_custom: { showOperationHint: true },
  ud_dns_nameservers_set_default: { showOperationHint: true },
  ud_dns_hosting_add: { showOperationHint: true },
  ud_dns_hosting_remove: { showOperationHint: true },
  // Authenticated URL
  ud_authenticated_url_get: { magicLinkFields: ['url'] },
  // Backorders
  ud_backorders_list: {
    postActionHint: chalk.dim('\nTip: Cancel a backorder: ud domains backorders cancel --backorder-ids <id>'),
  },
  ud_backorder_cancel: {
    requireConfirm: {
      message: 'This will cancel the specified backorder(s) and issue refunds. Are you sure?',
    },
    showFailureHints: true,
    postActionHint: chalk.dim('\nTip: View remaining backorders: ud domains backorders list'),
  },
  ud_backorder_create: {
    preAction: async (ctx) => {
      const domains = ctx.body.domains as Record<string, unknown>[] | undefined;
      if (!domains || domains.length === 0) {
        return {
          abort: true,
          message: 'Missing required fields: --name, --contact-id, and --available-after-timestamp are all required.\n'
            + chalk.dim('Tip: Find the timestamp for a domain: ud marketplace expiring list --query <domain>'),
        };
      }
      const missing: string[] = [];
      for (const entry of domains) {
        if (!entry.name) missing.push('--name');
        if (entry.contactId == null) missing.push('--contact-id');
        if (entry.availableAfterTimestamp == null) missing.push('--available-after-timestamp');
        if (missing.length > 0) break;
      }
      if (missing.length > 0) {
        return {
          abort: true,
          message: `Missing required field(s): ${missing.join(', ')}\n`
            + chalk.dim('Tip: Find the timestamp for a domain: ud marketplace expiring list --query <domain>'),
        };
      }
    },
    postActionHint: chalk.dim('\nTip: View your backorders: ud domains backorders list'),
  },
  // Expiring domains
  ud_expireds_list: {
    postActionHint: chalk.dim('\nTip: Place a backorder: ud domains backorders create --name <domain> --contact-id <id> --available-after-timestamp <ts>'),
  },
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
    ? `ud domains operations show ${domainList}`
    : 'ud domains operations show <domain>';

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

/**
 * Format a hint about viewing lead messages from lead list results.
 * Uses the first lead's ID to show a concrete example command.
 */
export function formatLeadMessagesHint(result: unknown): string {
  if (!result || typeof result !== 'object') return '';

  const obj = result as Record<string, unknown>;
  const leads = (obj.results ?? obj.leads ?? obj.conversations) as Record<string, unknown>[] | undefined;
  if (!Array.isArray(leads) || leads.length === 0) return '';

  const firstId = leads[0].id;
  const idExample = firstId != null ? String(firstId) : '<id>';

  return chalk.dim(`\nTip: View messages for a lead:\n  ud marketplace leads messages list --conversation-id ${idExample}`);
}
