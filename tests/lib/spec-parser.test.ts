import { parseSpec } from '../../src/lib/spec-parser.js';
import type { CommandSpec } from '../../src/lib/spec-parser.js';

function makeSpec(paths: Record<string, unknown>, schemas: Record<string, unknown> = {}) {
  return {
    openapi: '3.1.0',
    info: { title: 'Test', version: '1.0.0' },
    paths,
    components: { schemas },
  } as Parameters<typeof parseSpec>[0];
}

function makeEndpoint(
  toolName: string,
  {
    operationId = 'testOp',
    summary = 'Test summary',
    description = 'Test desc',
    schema = {},
    responseSchema = {},
  }: {
    operationId?: string;
    summary?: string;
    description?: string;
    schema?: Record<string, unknown>;
    responseSchema?: Record<string, unknown>;
  } = {},
) {
  return {
    [`/mcp/v1/actions/${toolName}`]: {
      post: {
        operationId,
        summary,
        description,
        requestBody: {
          required: true,
          content: { 'application/json': { schema } },
        },
        responses: {
          '200': {
            description: 'OK',
            content: { 'application/json': { schema: responseSchema } },
          },
        },
      },
    },
  };
}

describe('spec-parser', () => {
  describe('parseSpec', () => {
    it('extracts tool name from path', () => {
      const spec = makeSpec(
        makeEndpoint('ud_domains_search', { operationId: 'domainsSearch' }),
      );
      const result = parseSpec(spec);
      expect(result).toHaveLength(1);
      expect(result[0].toolName).toBe('ud_domains_search');
      expect(result[0].operationId).toBe('domainsSearch');
    });

    it('extracts summary and description', () => {
      const spec = makeSpec(
        makeEndpoint('ud_tld_list', {
          summary: 'List available TLDs',
          description: 'Lists all TLDs',
        }),
      );
      const [cmd] = parseSpec(spec);
      expect(cmd.summary).toBe('List available TLDs');
      expect(cmd.description).toBe('Lists all TLDs');
    });

    it('parses flat params with types and required', () => {
      const spec = makeSpec(
        makeEndpoint('ud_domains_search', {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: { type: 'string', description: 'Search query' },
              limit: { type: 'number', minimum: 1, maximum: 100 },
              offset: { type: 'number', minimum: 0 },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.params).toHaveLength(3);

      const query = cmd.params.find((p) => p.name === 'query')!;
      expect(query.type).toBe('string');
      expect(query.required).toBe(true);
      expect(query.description).toBe('Search query');

      const limit = cmd.params.find((p) => p.name === 'limit')!;
      expect(limit.type).toBe('number');
      expect(limit.required).toBe(false);
      expect(limit.minimum).toBe(1);
      expect(limit.maximum).toBe(100);
    });

    it('handles empty properties', () => {
      const spec = makeSpec(
        makeEndpoint('ud_tld_list', {
          schema: { type: 'object', properties: {} },
        }),
      );
      const [cmd] = parseSpec(spec);
      expect(cmd.params).toHaveLength(0);
    });

    it('resolves $ref pointers', () => {
      const spec = makeSpec(
        {
          '/mcp/v1/actions/ud_test': {
            post: {
              operationId: 'test',
              summary: 'Test',
              requestBody: {
                required: true,
                content: {
                  'application/json': {
                    schema: { $ref: '#/components/schemas/TestInput' },
                  },
                },
              },
              responses: { '200': { description: 'OK' } },
            },
          },
        },
        {
          TestInput: {
            type: 'object',
            required: ['name'],
            properties: {
              name: { type: 'string', description: 'The name' },
            },
          },
        },
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.params).toHaveLength(1);
      expect(cmd.params[0].name).toBe('name');
      expect(cmd.params[0].required).toBe(true);
    });

    it('handles array params with items', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            required: ['domains'],
            properties: {
              domains: {
                type: 'array',
                items: { type: 'string' },
                description: 'Domain names',
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      const domains = cmd.params.find((p) => p.name === 'domains')!;
      expect(domains.type).toBe('array');
      expect(domains.items?.type).toBe('string');
    });

    it('handles object params with nested properties', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            required: ['phone'],
            properties: {
              phone: {
                type: 'object',
                required: ['number'],
                properties: {
                  dialingPrefix: { type: 'string' },
                  number: { type: 'string' },
                },
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      const phone = cmd.params.find((p) => p.name === 'phone')!;
      expect(phone.type).toBe('object');
      expect(phone.properties).toHaveLength(2);
      expect(phone.properties![1].name).toBe('number');
      expect(phone.properties![1].required).toBe(true);
    });

    it('handles array of objects (nested items)', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            required: ['records'],
            properties: {
              records: {
                type: 'array',
                items: {
                  type: 'object',
                  required: ['domain', 'type'],
                  properties: {
                    domain: { type: 'string' },
                    type: { type: 'string', enum: ['A', 'AAAA', 'CNAME'] },
                    ttl: { type: 'number', default: 3600 },
                  },
                },
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      const records = cmd.params.find((p) => p.name === 'records')!;
      expect(records.type).toBe('array');
      expect(records.items?.type).toBe('object');
      expect(records.items?.properties).toHaveLength(3);

      const typeParam = records.items!.properties!.find((p) => p.name === 'type')!;
      expect(typeParam.enum).toEqual(['A', 'AAAA', 'CNAME']);

      const ttl = records.items!.properties!.find((p) => p.name === 'ttl')!;
      expect(ttl.default).toBe(3600);
    });

    it('extracts enum values', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            properties: {
              action: { type: 'string', enum: ['enable', 'disable'] },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.params[0].enum).toEqual(['enable', 'disable']);
    });

    it('handles oneOf by picking string variant', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            required: ['query'],
            properties: {
              query: {
                oneOf: [
                  { type: 'string', minLength: 1 },
                  { type: 'array', items: { type: 'string' } },
                ],
                description: 'Search term',
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      const query = cmd.params.find((p) => p.name === 'query')!;
      expect(query.type).toBe('string');
      expect(query.description).toBe('Search term');
    });

    it('normalizes integer type to number', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          schema: {
            type: 'object',
            properties: {
              count: { type: 'integer', minimum: 1 },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.params[0].type).toBe('number');
    });
  });

  describe('response pattern detection', () => {
    it('detects bulk pattern (successCount + failureCount)', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          responseSchema: {
            type: 'object',
            properties: {
              results: { type: 'array', items: { type: 'object' } },
              successCount: { type: 'number' },
              failureCount: { type: 'number' },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.responsePattern).toBe('bulk');
    });

    it('detects offset-based pagination from offset property', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          responseSchema: {
            type: 'object',
            properties: {
              domains: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  total: { type: 'number' },
                  count: { type: 'number' },
                  offset: { type: 'number' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
                  nextOffset: { type: 'number' },
                },
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.responsePattern).toBe('paginated-offset');
    });

    it('detects offset-based pagination', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          responseSchema: {
            type: 'object',
            properties: {
              results: { type: 'array' },
              pagination: {
                type: 'object',
                properties: {
                  offset: { type: 'number' },
                  limit: { type: 'number' },
                  hasMore: { type: 'boolean' },
                  nextOffset: { type: 'number' },
                },
              },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.responsePattern).toBe('paginated-offset');
    });

    it('defaults to simple pattern', () => {
      const spec = makeSpec(
        makeEndpoint('ud_test', {
          responseSchema: {
            type: 'object',
            properties: {
              success: { type: 'boolean' },
            },
          },
        }),
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.responsePattern).toBe('simple');
    });

    it('detects bulk from $ref response schema', () => {
      const spec = makeSpec(
        {
          '/mcp/v1/actions/ud_test': {
            post: {
              operationId: 'test',
              summary: 'Test',
              requestBody: {
                content: { 'application/json': { schema: { type: 'object', properties: {} } } },
              },
              responses: {
                '200': {
                  description: 'OK',
                  content: {
                    'application/json': {
                      schema: { $ref: '#/components/schemas/BulkResponse' },
                    },
                  },
                },
              },
            },
          },
        },
        {
          BulkResponse: {
            type: 'object',
            properties: {
              results: { type: 'array' },
              successCount: { type: 'number' },
              failureCount: { type: 'number' },
            },
          },
        },
      );

      const [cmd] = parseSpec(spec);
      expect(cmd.responsePattern).toBe('bulk');
    });
  });

  describe('parsing the real spec', () => {
    let specs: CommandSpec[];

    beforeAll(async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __dirname = resolve(fileURLToPath(import.meta.url), '..');
      const specPath = resolve(__dirname, '../../src/generated/openapi-spec.json');
      const raw = JSON.parse(readFileSync(specPath, 'utf-8'));
      specs = parseSpec(raw);
    });

    it('parses all endpoints', () => {
      expect(specs.length).toBeGreaterThanOrEqual(42);
    });

    it('all specs have toolName and operationId', () => {
      for (const cmd of specs) {
        expect(cmd.toolName).toBeTruthy();
        expect(cmd.operationId).toBeTruthy();
      }
    });

    it('ud_domains_search has expected params', () => {
      const search = specs.find((s) => s.toolName === 'ud_domains_search')!;
      expect(search).toBeDefined();
      expect(search.params.find((p) => p.name === 'query')?.required).toBe(true);
      expect(search.params.find((p) => p.name === 'limit')?.type).toBe('number');
      expect(search.responsePattern).toBe('paginated-offset');
    });

    it('ud_dns_record_add has nested array-of-objects', () => {
      const add = specs.find((s) => s.toolName === 'ud_dns_record_add')!;
      expect(add).toBeDefined();
      const records = add.params.find((p) => p.name === 'records')!;
      expect(records.type).toBe('array');
      expect(records.items?.type).toBe('object');
      expect(records.items?.properties?.length).toBeGreaterThan(0);
    });

    it('detects bulk response pattern for DNS operations', () => {
      const add = specs.find((s) => s.toolName === 'ud_dns_record_add')!;
      expect(add.responsePattern).toBe('bulk');
    });

    it('ud_portfolio_list uses page-based pagination', () => {
      const list = specs.find((s) => s.toolName === 'ud_portfolio_list')!;
      expect(list.responsePattern).toBe('paginated-page');
    });
  });
});
