import { getHooks, formatOperationHint } from '../../src/lib/command-hooks.js';

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

    it('returns undefined for tools without hooks', () => {
      expect(getHooks('ud_domains_search')).toBeUndefined();
      expect(getHooks('ud_portfolio_list')).toBeUndefined();
      expect(getHooks('ud_dns_records_list')).toBeUndefined();
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
      expect(hint).toContain('ud domains operations');
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
      expect(hint).toContain('ud domains operations <domain>');
    });
  });
});
