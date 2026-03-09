import { formatOutput, formatError } from '../../src/lib/formatter.js';

// Strip ANSI codes for easier assertion
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

describe('formatter', () => {
  describe('JSON output', () => {
    it('pretty-prints JSON', () => {
      const data = { name: 'test.com', available: true };
      const result = formatOutput(data, { format: 'json' });
      expect(result).toBe(JSON.stringify(data, null, 2));
    });

    it('handles arrays', () => {
      const data = [1, 2, 3];
      const result = formatOutput(data, { format: 'json' });
      expect(JSON.parse(result)).toEqual([1, 2, 3]);
    });
  });

  describe('table output', () => {
    it('renders a table from results array', () => {
      const data = {
        results: [
          { name: 'test.com', available: true },
          { name: 'foo.com', available: false },
        ],
      };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('test.com');
      expect(result).toContain('foo.com');
      expect(result).toContain('Name');
    });

    it('renders "No results." for empty data', () => {
      const data = { results: [] };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('No results.');
    });

    it('renders "No results." when all row column values are null', () => {
      const data = { results: [{ name: null, available: null }] };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', toolName: 'ud_domains_search' }),
      );
      expect(result).toContain('No results.');
    });

    it('uses configured columns for known tools', () => {
      const data = {
        results: [
          {
            name: 'test.com',
            available: true,
            marketplace: { status: 'available' },
            pricing: { formatted: '$9.99', amount: 999 },
          },
        ],
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', toolName: 'ud_domains_search' }),
      );
      expect(result).toContain('test.com');
      expect(result).toContain('Available');
      expect(result).toContain('$9.99');
    });

    it('handles dotted column paths for nested values', () => {
      const data = {
        results: [
          { pricing: { formatted: '$5.00' }, name: 'a.com' },
        ],
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', toolName: 'ud_domains_search' }),
      );
      expect(result).toContain('$5.00');
    });

    it('auto-detects columns when no config exists', () => {
      const data = {
        items: [
          { id: 1, label: 'Item A', count: 5 },
          { id: 2, label: 'Item B', count: 3 },
        ],
      };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('ID');
      expect(result).toContain('Label');
      expect(result).toContain('Item A');
    });

    it('treats scalar response as single-row table', () => {
      const data = { success: true, orderId: 123 };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('Success');
      expect(result).toContain('123');
    });

    it('--fields overrides default columns', () => {
      const data = {
        results: [
          { name: 'test.com', available: true, extra: 'hidden' },
          { name: 'foo.com', available: false, extra: 'also hidden' },
        ],
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', fields: ['name', 'extra'] }),
      );
      expect(result).toContain('Name');
      expect(result).toContain('Extra');
      expect(result).toContain('hidden');
      expect(result).not.toContain('Available');
    });

    it('--fields works with nested dotted paths', () => {
      const data = {
        results: [
          { name: 'test.com', pricing: { formatted: '$9.99' }, marketplace: { status: 'listed' } },
        ],
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', fields: ['name', 'pricing.formatted'] }),
      );
      expect(result).toContain('$9.99');
      expect(result).not.toContain('listed');
    });

    it('--fields applies to CSV output', () => {
      const data = {
        results: [
          { name: 'test.com', available: true, extra: 'val' },
        ],
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'csv', fields: ['extra', 'name'] }),
      );
      const lines = result.split('\n');
      expect(lines[0]).toBe('Extra,Name');
      expect(lines[1]).toContain('val');
      expect(lines[1]).toContain('test.com');
    });
  });

  describe('CSV output', () => {
    it('renders CSV with header and rows', () => {
      const data = {
        results: [
          { name: 'test.com', available: true },
          { name: 'foo.com', available: false },
        ],
      };
      const result = stripAnsi(formatOutput(data, { format: 'csv' }));
      const lines = result.split('\n');
      expect(lines[0]).toBe('Name,Available');
      expect(lines[1]).toContain('test.com');
    });

    it('escapes commas in CSV values', () => {
      const data = {
        results: [{ name: 'test, inc.com', status: 'ok' }],
      };
      const result = stripAnsi(formatOutput(data, { format: 'csv' }));
      expect(result).toContain('"test, inc.com"');
    });

    it('returns empty string for no results', () => {
      const data = { results: [] };
      const result = formatOutput(data, { format: 'csv' });
      // Should not contain header row either since there's nothing
      expect(stripAnsi(result).trim()).toBe('');
    });
  });

  describe('bulk summary', () => {
    it('formats success and failure counts', () => {
      const data = { results: [{ success: true }], successCount: 3, failureCount: 1 };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('3 succeeded');
      expect(result).toContain('1 failed');
    });

    it('omits bulk summary when not present', () => {
      const data = { results: [{ name: 'test' }] };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).not.toContain('succeeded');
      expect(result).not.toContain('failed');
    });
  });

  describe('pagination hints', () => {
    it('shows page-based pagination hint with context', () => {
      const data = {
        domains: [{ name: 'test.com' }],
        pagination: { page: 1, totalPages: 3, total: 150, hasMore: true, nextPage: 2 },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).toContain('Page 1 of 3 (150 total)');
      expect(result).toContain('Next page: --page 2');
    });

    it('computes next page from current page when nextPage is absent', () => {
      const data = {
        domains: [{ name: 'test.com' }],
        pagination: { page: 2, totalPages: 5, total: 250, hasMore: true },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).toContain('Page 2 of 5 (250 total)');
      expect(result).toContain('Next page: --page 3');
    });

    it('shows offset-based pagination hint', () => {
      const data = {
        results: [{ name: 'test.com' }],
        pagination: { offset: 0, hasMore: true, nextOffset: 20 },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-offset' }),
      );
      expect(result).toContain('Next page: --offset 20');
    });

    it('shows context without next-page hint when hasMore is false', () => {
      const data = {
        results: [{ name: 'test.com' }],
        pagination: { page: 3, totalPages: 3, total: 150, hasMore: false },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).toContain('Page 3 of 3 (150 total)');
      expect(result).not.toContain('Next page');
    });

    it('omits everything when no pagination data', () => {
      const data = {
        results: [{ name: 'test.com' }],
        pagination: { hasMore: false },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).not.toContain('Page');
      expect(result).not.toContain('Next page');
    });
  });

  describe('formatError', () => {
    it('formats Error instances', () => {
      const result = stripAnsi(formatError(new Error('something broke')));
      expect(result).toBe('Error: something broke');
    });

    it('formats non-Error values', () => {
      const result = stripAnsi(formatError('string error'));
      expect(result).toBe('Error: string error');
    });
  });
});
