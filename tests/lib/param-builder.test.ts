import { buildParams, specParamToOption } from '../../src/lib/param-builder.js';
import type { CommandRoute } from '../../src/lib/command-registry.js';
import type { ParamSpec } from '../../src/lib/spec-parser.js';

const SIMPLE_ROUTE: CommandRoute = {
  toolName: 'ud_domains_search',
  path: ['domains', 'search'],
  positionalArgs: [
    { name: 'query', description: 'Search query', required: true, variadic: false },
  ],
};

const VARIADIC_ROUTE: CommandRoute = {
  toolName: 'ud_domain_get',
  path: ['domains', 'get'],
  positionalArgs: [
    { name: 'domains', description: 'Domains', required: true, variadic: true },
  ],
};

const DNS_ADD_ROUTE: CommandRoute = {
  toolName: 'ud_dns_record_add',
  path: ['dns', 'records', 'add'],
  positionalArgs: [
    { name: 'domain', description: 'Domain', required: true, variadic: false },
  ],
};

const NO_ARGS_ROUTE: CommandRoute = {
  toolName: 'ud_cart_get',
  path: ['cart', 'get'],
  positionalArgs: [],
};

const searchParams: ParamSpec[] = [
  { name: 'query', type: 'string', required: true, description: 'Search query' },
  { name: 'tlds', type: 'array', required: false, description: 'TLDs', items: { name: 'tlds[]', type: 'string', required: false } },
  { name: 'limit', type: 'number', required: false, minimum: 1, maximum: 100 },
  { name: 'offset', type: 'number', required: false, minimum: 0 },
];

const domainGetParams: ParamSpec[] = [
  {
    name: 'domains',
    type: 'array',
    required: true,
    items: {
      name: 'domains[]',
      type: 'object',
      required: false,
      properties: [{ name: 'name', type: 'string', required: true }],
    },
  },
];

const dnsAddParams: ParamSpec[] = [
  {
    name: 'records',
    type: 'array',
    required: true,
    items: {
      name: 'records[]',
      type: 'object',
      required: false,
      properties: [
        { name: 'domain', type: 'string', required: true },
        { name: 'type', type: 'string', required: true, enum: ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] },
        { name: 'values', type: 'array', required: true, items: { name: 'values[]', type: 'string', required: false } },
        { name: 'ttl', type: 'number', required: false, default: 3600 },
      ],
    },
  },
];

describe('param-builder', () => {
  describe('buildParams', () => {
    it('maps a scalar positional arg to body', () => {
      const result = buildParams(SIMPLE_ROUTE, searchParams, { query: 'test.com' }, {});
      expect(result).toEqual({ query: 'test.com' });
    });

    it('maps variadic positional to array of objects when items are objects', () => {
      const result = buildParams(
        VARIADIC_ROUTE,
        domainGetParams,
        { domains: ['a.com', 'b.com'] },
        {},
      );
      expect(result).toEqual({
        domains: [{ name: 'a.com' }, { name: 'b.com' }],
      });
    });

    it('maps variadic positional to plain array when items are strings', () => {
      const simpleArrayParams: ParamSpec[] = [
        { name: 'domains', type: 'array', required: true, items: { name: 'domains[]', type: 'string', required: false } },
      ];
      const result = buildParams(
        VARIADIC_ROUTE,
        simpleArrayParams,
        { domains: ['a.com', 'b.com'] },
        {},
      );
      expect(result).toEqual({ domains: ['a.com', 'b.com'] });
    });

    it('coerces number flags', () => {
      const result = buildParams(SIMPLE_ROUTE, searchParams, { query: 'test' }, { limit: '50' });
      expect(result).toEqual({ query: 'test', limit: 50 });
    });

    it('handles comma-separated array flags', () => {
      const result = buildParams(SIMPLE_ROUTE, searchParams, { query: 'test' }, { tlds: 'com,org,io' });
      expect(result).toEqual({ query: 'test', tlds: ['com', 'org', 'io'] });
    });

    it('handles --data override', () => {
      const data = JSON.stringify({ custom: 'body', nested: { key: 1 } });
      const result = buildParams(SIMPLE_ROUTE, searchParams, { query: 'test' }, { data });
      expect(result).toEqual({ custom: 'body', nested: { key: 1 } });
    });

    it('throws on invalid --data JSON', () => {
      expect(() =>
        buildParams(SIMPLE_ROUTE, searchParams, {}, { data: 'not json' }),
      ).toThrow('Invalid JSON in --data');
    });

    it('single-item shorthand wraps flags into array-of-objects', () => {
      const result = buildParams(DNS_ADD_ROUTE, dnsAddParams, { domain: 'test.com' }, {
        type: 'A',
        values: '1.2.3.4',
      });
      expect(result).toEqual({
        records: [{
          domain: 'test.com',
          type: 'A',
          values: ['1.2.3.4'],
        }],
      });
    });

    it('handles kebab-case flag names', () => {
      const params: ParamSpec[] = [
        { name: 'discountCode', type: 'string', required: false },
      ];
      const result = buildParams(NO_ARGS_ROUTE, params, {}, { 'discount-code': 'SAVE10' });
      expect(result).toEqual({ discountCode: 'SAVE10' });
    });

    it('handles boolean coercion', () => {
      const params: ParamSpec[] = [
        { name: 'includeDisabled', type: 'boolean', required: false },
      ];
      const result = buildParams(NO_ARGS_ROUTE, params, {}, { 'include-disabled': 'true' });
      expect(result).toEqual({ includeDisabled: true });

      const result2 = buildParams(NO_ARGS_ROUTE, params, {}, { 'include-disabled': 'false' });
      expect(result2).toEqual({ includeDisabled: false });
    });

    it('reads --file as JSON body', async () => {
      const fs = await import('node:fs');
      const tmpPath = '/tmp/ud-test-params.json';
      fs.writeFileSync(tmpPath, JSON.stringify({ fromFile: true }));

      const result = buildParams(SIMPLE_ROUTE, searchParams, {}, { file: tmpPath });
      expect(result).toEqual({ fromFile: true });

      fs.unlinkSync(tmpPath);
    });
  });

  describe('specParamToOption', () => {
    it('generates flag for string param', () => {
      const opt = specParamToOption(
        { name: 'query', type: 'string', required: true, description: 'Search query' },
        new Set(),
      );
      expect(opt).not.toBeNull();
      expect(opt!.flags).toBe('--query <query>');
      expect(opt!.description).toBe('Search query');
    });

    it('generates flag for number param', () => {
      const opt = specParamToOption(
        { name: 'limit', type: 'number', required: false, description: 'Max results', default: 20 },
        new Set(),
      );
      expect(opt!.flags).toBe('--limit <limit>');
      expect(opt!.description).toContain('[default: 20]');
    });

    it('generates flag for boolean param', () => {
      const opt = specParamToOption(
        { name: 'includeDisabled', type: 'boolean', required: false },
        new Set(),
      );
      expect(opt!.flags).toBe('--include-disabled');
    });

    it('includes enum values in description', () => {
      const opt = specParamToOption(
        { name: 'action', type: 'string', required: true, enum: ['enable', 'disable'], description: 'Action' },
        new Set(),
      );
      expect(opt!.description).toContain('enable, disable');
    });

    it('skips params in skipNames set', () => {
      const opt = specParamToOption(
        { name: 'query', type: 'string', required: true },
        new Set(['query']),
      );
      expect(opt).toBeNull();
    });

    it('skips complex object params', () => {
      const opt = specParamToOption(
        {
          name: 'phone',
          type: 'object',
          required: true,
          properties: [
            { name: 'number', type: 'string', required: true },
          ],
        },
        new Set(),
      );
      expect(opt).toBeNull();
    });

    it('skips array-of-objects params', () => {
      const opt = specParamToOption(
        {
          name: 'records',
          type: 'array',
          required: true,
          items: { name: 'records[]', type: 'object', required: false, properties: [] },
        },
        new Set(),
      );
      expect(opt).toBeNull();
    });
  });
});
