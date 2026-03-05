import { getHooks, formatOperationHint, formatCartHint, formatFailureHints, formatLeadMessagesHint, type PreActionContext } from '../../src/lib/command-hooks.js';

// Strip ANSI codes for easier assertion
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('command-hooks', () => {
  describe('getHooks', () => {
    it('returns requireConfirm for ud_dns_records_remove_all', () => {
      const hooks = getHooks('ud_dns_records_remove_all');
      expect(hooks).toBeDefined();
      expect(hooks!.requireConfirm).toBeDefined();
      expect(hooks!.requireConfirm!.paramName).toBe('confirmDeleteAll');
      expect(hooks!.requireConfirm!.message).toContain('ALL DNS records');
    });

    it('returns requireConfirm for ud_domain_remove_lander', () => {
      const hooks = getHooks('ud_domain_remove_lander');
      expect(hooks).toBeDefined();
      expect(hooks!.requireConfirm).toBeDefined();
      expect(hooks!.requireConfirm!.message).toContain('AI lander');
    });

    it('returns promptInput for ud_domain_push', () => {
      const hooks = getHooks('ud_domain_push');
      expect(hooks).toBeDefined();
      expect(hooks!.promptInput).toBeDefined();
      expect(hooks!.promptInput!.paramName).toBe('otpCode');
      expect(hooks!.promptInput!.validate).toEqual(/^\d{6}$/);
    });

    it('returns showFailureHints for DNS record mutation tools', () => {
      const tools = ['ud_dns_record_add', 'ud_dns_record_update', 'ud_dns_record_remove'];
      for (const tool of tools) {
        expect(getHooks(tool)?.showFailureHints).toBe(true);
      }
    });

    it('returns showOperationHint for DNS mutation tools', () => {
      const dnsTools = [
        'ud_dns_record_add',
        'ud_dns_record_update',
        'ud_dns_record_remove',
        'ud_dns_records_remove_all',
        'ud_dns_nameservers_set_custom',
        'ud_dns_nameservers_set_default',
        'ud_dns_hosting_add',
        'ud_dns_hosting_remove',
      ];
      for (const tool of dnsTools) {
        const hooks = getHooks(tool);
        expect(hooks?.showOperationHint).toBe(true);
      }
    });

    it('returns showCartHint for ud_domains_search', () => {
      const hooks = getHooks('ud_domains_search');
      expect(hooks).toBeDefined();
      expect(hooks!.showCartHint).toBe(true);
    });

    it('returns undefined for tools without hooks', () => {
      expect(getHooks('ud_nonexistent_tool')).toBeUndefined();
      expect(getHooks('some_unknown_tool')).toBeUndefined();
    });
  });

  describe('formatOperationHint', () => {
    it('extracts domains from results with operationId', () => {
      const result = {
        results: [
          { domain: 'a.com', success: true, operationId: 'op-1' },
          { domain: 'b.com', success: true, operationId: 'op-2' },
        ],
      };
      const hint = stripAnsi(formatOperationHint(result));
      expect(hint).toContain('DNS changes are async');
      expect(hint).toContain('a.com');
      expect(hint).toContain('b.com');
      expect(hint).toContain('ud domains operations show');
    });

    it('returns empty string when no operationId found', () => {
      const result = {
        results: [{ domain: 'a.com', success: true }],
      };
      expect(formatOperationHint(result)).toBe('');
    });

    it('returns empty string for null/non-object input', () => {
      expect(formatOperationHint(null)).toBe('');
      expect(formatOperationHint('string')).toBe('');
      expect(formatOperationHint(undefined)).toBe('');
    });

    it('returns empty string when results is not an array', () => {
      expect(formatOperationHint({ results: 'not-array' })).toBe('');
      expect(formatOperationHint({ noResults: true })).toBe('');
    });

    it('deduplicates domains', () => {
      const result = {
        results: [
          { domain: 'a.com', operationId: 'op-1' },
          { domain: 'a.com', operationId: 'op-2' },
        ],
      };
      const hint = stripAnsi(formatOperationHint(result));
      // Should only contain a.com once
      const matches = hint.match(/a\.com/g);
      expect(matches).toHaveLength(1);
    });

    it('shows generic hint when results have operationId but no domain', () => {
      const result = {
        results: [{ operationId: 'op-1' }],
      };
      const hint = stripAnsi(formatOperationHint(result));
      expect(hint).toContain('ud domains operations show <domain>');
    });
  });

  describe('formatCartHint', () => {
    it('shows cart add command for first available domain', () => {
      const result = {
        results: [
          { name: 'taken.com', available: false, marketplace: { status: 'registered-not-for-sale' } },
          { name: 'free.com', available: true, marketplace: { status: 'available', source: 'unstoppable_domains' } },
        ],
      };
      const hint = stripAnsi(formatCartHint(result));
      expect(hint).toContain('ud cart add registration free.com');
    });

    it('maps afternic source to afternic subcommand', () => {
      const result = {
        results: [
          { name: 'afternic-domain.com', available: true, marketplace: { status: 'afternic', source: 'afternic' } },
        ],
      };
      const hint = stripAnsi(formatCartHint(result));
      expect(hint).toContain('ud cart add afternic afternic-domain.com');
    });

    it('maps sedo source to sedo subcommand', () => {
      const result = {
        results: [
          { name: 'sedo-domain.com', available: true, marketplace: { status: 'sedo', source: 'sedo' } },
        ],
      };
      const hint = stripAnsi(formatCartHint(result));
      expect(hint).toContain('ud cart add sedo sedo-domain.com');
    });

    it('maps aftermarket source to listed subcommand', () => {
      const result = {
        results: [
          { name: 'listed.com', available: true, marketplace: { status: 'for-sale', source: 'aftermarket' } },
        ],
      };
      const hint = stripAnsi(formatCartHint(result));
      expect(hint).toContain('ud cart add listed listed.com');
    });

    it('returns empty string when no results are available', () => {
      const result = {
        results: [
          { name: 'taken.com', available: false },
        ],
      };
      expect(formatCartHint(result)).toBe('');
    });

    it('returns empty string for empty results', () => {
      expect(formatCartHint({ results: [] })).toBe('');
      expect(formatCartHint(null)).toBe('');
      expect(formatCartHint({})).toBe('');
    });
  });

  describe('formatLeadMessagesHint', () => {
    it('shows hint with first lead ID', () => {
      const result = { results: [{ id: 'conv-123' }, { id: 'conv-456' }] };
      const hint = stripAnsi(formatLeadMessagesHint(result));
      expect(hint).toContain('ud marketplace leads messages list --conversation-id conv-123');
    });

    it('handles leads key', () => {
      const result = { leads: [{ id: 'lead-1' }] };
      const hint = stripAnsi(formatLeadMessagesHint(result));
      expect(hint).toContain('--conversation-id lead-1');
    });

    it('returns empty string for empty results', () => {
      expect(formatLeadMessagesHint({ results: [] })).toBe('');
      expect(formatLeadMessagesHint(null)).toBe('');
      expect(formatLeadMessagesHint({})).toBe('');
    });
  });

  describe('postActionHint functions (via getHooks)', () => {
    it('formatPostCheckoutHint shows purchased domains', () => {
      const hooks = getHooks('ud_cart_checkout');
      expect(typeof hooks?.postActionHint).toBe('function');
      const hint = stripAnsi((hooks!.postActionHint as (r: unknown) => string)({
        summary: { domains: ['example.com', 'test.com'] },
      }));
      expect(hint).toContain('ud domains get example.com test.com');
    });

    it('formatPostCheckoutHint returns empty for missing domains', () => {
      const fn = getHooks('ud_cart_checkout')!.postActionHint as (r: unknown) => string;
      expect(fn({ summary: {} })).toBe('');
      expect(fn(null)).toBe('');
    });

    it('formatOfferRespondHint shows offer ID', () => {
      const fn = getHooks('ud_offers_list')!.postActionHint as (r: unknown) => string;
      const hint = stripAnsi(fn({ offers: [{ id: 'offer-42' }] }));
      expect(hint).toContain('--offer-id offer-42');
      expect(hint).toContain('--action accept');
    });

    it('formatOfferRespondHint handles results key', () => {
      const fn = getHooks('ud_offers_list')!.postActionHint as (r: unknown) => string;
      const hint = stripAnsi(fn({ results: [{ id: 'offer-99' }] }));
      expect(hint).toContain('--offer-id offer-99');
    });

    it('formatOfferRespondHint returns empty for no offers', () => {
      const fn = getHooks('ud_offers_list')!.postActionHint as (r: unknown) => string;
      expect(fn({ offers: [] })).toBe('');
      expect(fn(null)).toBe('');
    });

    it('formatOperationsNextHint shows pending message when operations pending', () => {
      const fn = getHooks('ud_domain_pending_operations')!.postActionHint as (r: unknown) => string;
      const hint = stripAnsi(fn({
        summary: { domainsWithPending: ['a.com', 'b.com'] },
      }));
      expect(hint).toContain('Operations still pending');
      expect(hint).toContain('ud domains operations show a.com b.com');
    });

    it('formatOperationsNextHint shows complete message when no pending', () => {
      const fn = getHooks('ud_domain_pending_operations')!.postActionHint as (r: unknown) => string;
      const hint = stripAnsi(fn({
        results: [{ domain: 'done.com' }],
        summary: {},
      }));
      expect(hint).toContain('All operations complete');
      expect(hint).toContain('ud domains dns records show done.com');
    });

    it('formatDnsRecordsHint includes domain in add command', () => {
      const fn = getHooks('ud_dns_records_list')!.postActionHint as (r: unknown) => string;
      const hint = stripAnsi(fn({ domain: 'test.com' }));
      expect(hint).toContain('ud domains dns records add test.com');
    });

    it('cart add hooks use postActionHint with VIEW_CART_HINT', () => {
      const cartAddTools = [
        'ud_cart_add_domain_registration',
        'ud_cart_add_domain_listed',
        'ud_cart_add_domain_afternic',
        'ud_cart_add_domain_sedo',
        'ud_cart_add_domain_renewal',
      ];
      for (const tool of cartAddTools) {
        const hooks = getHooks(tool);
        expect(typeof hooks?.postActionHint).toBe('string');
        expect(stripAnsi(hooks!.postActionHint as string)).toContain('ud cart list');
      }
    });

    it('cart get uses postActionHint with checkout and payment tips', () => {
      const hooks = getHooks('ud_cart_get');
      expect(typeof hooks?.postActionHint).toBe('function');
      const hint = stripAnsi((hooks!.postActionHint as (r: unknown) => string)({}));
      expect(hint).toContain('ud cart checkout');
      expect(hint).toContain('ud cart payment-methods add');
    });

    it('payment methods list uses postActionHint with add payment tip', () => {
      const hooks = getHooks('ud_cart_get_payment_methods');
      expect(typeof hooks?.postActionHint).toBe('string');
      expect(stripAnsi(hooks!.postActionHint as string)).toContain('ud cart payment-methods add');
    });

    it('cart get url has magicLinkFields for checkoutUrl', () => {
      const hooks = getHooks('ud_cart_get_url');
      expect(hooks?.magicLinkFields).toEqual(['checkoutUrl']);
    });

    it('cart add payment method url has magicLinkFields for url', () => {
      const hooks = getHooks('ud_cart_add_payment_method_url');
      expect(hooks?.magicLinkFields).toEqual(['url']);
    });

    it('cart checkout has preAction hook', () => {
      const hooks = getHooks('ud_cart_checkout');
      expect(typeof hooks?.preAction).toBe('function');
    });

    it('leads list uses postActionHint with formatLeadMessagesHint', () => {
      const hooks = getHooks('ud_leads_list');
      expect(typeof hooks?.postActionHint).toBe('function');
      const hint = stripAnsi((hooks!.postActionHint as (r: unknown) => string)({
        results: [{ id: 'lead-abc' }],
      }));
      expect(hint).toContain('--conversation-id lead-abc');
    });
  });

  describe('checkoutPreAction', () => {
    const preAction = getHooks('ud_cart_checkout')!.preAction!;
    const noopPrompt = async () => '';
    const origStdinTTY = process.stdin.isTTY;

    afterEach(() => {
      Object.defineProperty(process.stdin, 'isTTY', { value: origStdinTTY, configurable: true });
    });

    it('aborts with message when no cards and no credits', async () => {
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [], summary: { totalCredits: 0 } };
          }
          if (tool === 'ud_cart_get_url') {
            return { checkoutUrl: 'https://ud.me/checkout/abc' };
          }
          return {};
        },
        createMagicLinkUrl: async (url: string) => `https://magic.example.com?token=tok&redirect=${encodeURIComponent(url)}`,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeDefined();
      expect(result!.abort).toBe(true);
      expect(stripAnsi(result!.message!)).toContain('No saved payment method');
      expect(result!.message!).toContain('https://magic.example.com');
    });

    it('does not abort when user has saved cards and contacts', async () => {
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [{ id: 'card-1' }], summary: { totalCredits: 0 } };
          }
          if (tool === 'ud_contacts_list') {
            return { contacts: [{ id: 'ct-1' }], count: 1 };
          }
          return {};
        },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeUndefined();
    });

    it('does not abort when user has account credits but no cards', async () => {
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [], summary: { totalCredits: 500 } };
          }
          if (tool === 'ud_contacts_list') {
            return { contacts: [{ id: 'ct-1' }], count: 1 };
          }
          return {};
        },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeUndefined();
    });

    it('lets checkout proceed when payment pre-check API fails (fail-open)', async () => {
      const ctx: PreActionContext = {
        callAction: async () => { throw new Error('network error'); },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeUndefined();
    });

    // --- ICANN contact check tests ---

    it('aborts with hint in non-TTY when no contacts exist', async () => {
      Object.defineProperty(process.stdin, 'isTTY', { value: false, configurable: true });
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [{ id: 'card-1' }], summary: { totalCredits: 0 } };
          }
          if (tool === 'ud_contacts_list') {
            return { contacts: [], count: 0 };
          }
          return {};
        },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeDefined();
      expect(result!.abort).toBe(true);
      expect(stripAnsi(result!.message!)).toContain('No ICANN contact');
      expect(stripAnsi(result!.message!)).toContain('ud domains contacts create');
    });

    it('lets checkout proceed when contacts API fails (fail-open)', async () => {
      let callCount = 0;
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [{ id: 'card-1' }], summary: { totalCredits: 0 } };
          }
          if (tool === 'ud_contacts_list') {
            throw new Error('contacts API down');
          }
          callCount++;
          return {};
        },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result).toBeUndefined();
    });

    it('skips contact check when payment check already aborts', async () => {
      let contactsCalled = false;
      const ctx: PreActionContext = {
        callAction: async (tool: string) => {
          if (tool === 'ud_cart_get_payment_methods') {
            return { savedCards: [], summary: { totalCredits: 0 } };
          }
          if (tool === 'ud_contacts_list') {
            contactsCalled = true;
            return { contacts: [], count: 0 };
          }
          if (tool === 'ud_cart_get_url') {
            return { checkoutUrl: 'https://ud.me/checkout' };
          }
          return {};
        },
        createMagicLinkUrl: async (url: string) => url,
        promptInput: noopPrompt,
        body: {},
      };
      const result = await preAction(ctx);
      expect(result!.abort).toBe(true);
      expect(contactsCalled).toBe(false);
    });
  });

  describe('formatFailureHints', () => {
    it('suggests --upsert-mode for NO_CHANGE on dns record add (JSON string error)', () => {
      const result = {
        results: [
          { domain: 'example.com', success: false, error: '{"code":"NO_CHANGE","message":"No changes would occur"}' },
        ],
      };
      const hint = stripAnsi(formatFailureHints('ud_dns_record_add', result));
      expect(hint).toContain('--upsert-mode append');
      expect(hint).toContain('--upsert-mode replace');
    });

    it('suggests --upsert-mode for NO_CHANGE on dns record add (object error)', () => {
      const result = {
        results: [
          { domain: 'example.com', success: false, error: { code: 'NO_CHANGE', message: 'No changes would occur' } },
        ],
      };
      const hint = stripAnsi(formatFailureHints('ud_dns_record_add', result));
      expect(hint).toContain('--upsert-mode append');
    });

    it('shows generic NO_CHANGE hint for non-add tools', () => {
      const result = {
        results: [
          { domain: 'example.com', success: false, error: '{"code":"NO_CHANGE","message":"No changes would occur"}' },
        ],
      };
      const hint = stripAnsi(formatFailureHints('ud_dns_record_update', result));
      expect(hint).toContain('already match');
      expect(hint).not.toContain('--upsert-mode');
    });

    it('returns empty string when all results succeed', () => {
      const result = {
        results: [
          { domain: 'example.com', success: true, operationId: 'op-1' },
        ],
      };
      expect(formatFailureHints('ud_dns_record_add', result)).toBe('');
    });

    it('returns empty string for null/non-object input', () => {
      expect(formatFailureHints('ud_dns_record_add', null)).toBe('');
      expect(formatFailureHints('ud_dns_record_add', undefined)).toBe('');
    });

    it('returns empty string for unknown error codes', () => {
      const result = {
        results: [
          { domain: 'example.com', success: false, error: '{"code":"UNKNOWN","message":"Something else"}' },
        ],
      };
      expect(formatFailureHints('ud_dns_record_add', result)).toBe('');
    });
  });
});
