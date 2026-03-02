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
      expect(result).toContain('name');
    });

    it('renders "No results." for empty data', () => {
      const data = { results: [] };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
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
      expect(result).toContain('available');
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
      expect(result).toContain('id');
      expect(result).toContain('label');
      expect(result).toContain('Item A');
    });

    it('treats scalar response as single-row table', () => {
      const data = { success: true, orderId: 123 };
      const result = stripAnsi(formatOutput(data, { format: 'table' }));
      expect(result).toContain('success');
      expect(result).toContain('123');
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
      expect(lines[0]).toBe('name,available');
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
    it('shows page-based pagination hint', () => {
      const data = {
        domains: [{ name: 'test.com' }],
        pagination: { page: 1, hasMore: true, nextPage: 2 },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).toContain('Use --page 2 to see more');
    });

    it('shows offset-based pagination hint', () => {
      const data = {
        results: [{ name: 'test.com' }],
        pagination: { offset: 0, hasMore: true, nextOffset: 20 },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-offset' }),
      );
      expect(result).toContain('Use --offset 20 to see more');
    });

    it('omits hint when hasMore is false', () => {
      const data = {
        results: [{ name: 'test.com' }],
        pagination: { hasMore: false },
      };
      const result = stripAnsi(
        formatOutput(data, { format: 'table', responsePattern: 'paginated-page' }),
      );
      expect(result).not.toContain('to see more');
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
