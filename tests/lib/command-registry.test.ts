import { COMMAND_ROUTES, getGroups, buildRouteMap } from '../../src/lib/command-registry.js';

describe('command-registry', () => {
  it('has routes for all registered tools', () => {
    // Assert minimum route count rather than exact number, which breaks when routes are added.
    // Specific route presence is verified in the individual tests below.
    expect(COMMAND_ROUTES.length).toBeGreaterThan(40);
  });

  it('has no duplicate tool names', () => {
    const names = COMMAND_ROUTES.map((r) => r.toolName);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has no duplicate command paths', () => {
    const paths = COMMAND_ROUTES.map((r) => r.path.join('/'));
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('all routes have at least 1-level paths', () => {
    for (const route of COMMAND_ROUTES) {
      expect(route.path.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('all routes have valid positional arg definitions', () => {
    for (const route of COMMAND_ROUTES) {
      for (const arg of route.positionalArgs) {
        expect(arg.name).toBeTruthy();
        expect(typeof arg.required).toBe('boolean');
        expect(typeof arg.variadic).toBe('boolean');
      }
    }
  });

  it('domain search route has query positional arg', () => {
    const search = COMMAND_ROUTES.find((r) => r.toolName === 'ud_domains_search')!;
    expect(search.path).toEqual(['search']);
    expect(search.positionalArgs).toHaveLength(1);
    expect(search.positionalArgs[0].name).toBe('query');
    expect(search.positionalArgs[0].required).toBe(true);
    expect(search.positionalArgs[0].variadic).toBe(false);
  });

  it('domain get route has variadic domains arg', () => {
    const get = COMMAND_ROUTES.find((r) => r.toolName === 'ud_domain_get')!;
    expect(get.path).toEqual(['domains', 'get']);
    expect(get.positionalArgs).toHaveLength(1);
    expect(get.positionalArgs[0].name).toBe('domains');
    expect(get.positionalArgs[0].variadic).toBe(true);
  });

  it('dns records show has single domain arg', () => {
    const list = COMMAND_ROUTES.find((r) => r.toolName === 'ud_dns_records_list')!;
    expect(list.path).toEqual(['domains', 'dns', 'records', 'show']);
    expect(list.positionalArgs).toHaveLength(1);
    expect(list.positionalArgs[0].name).toBe('domain');
    expect(list.positionalArgs[0].variadic).toBe(false);
  });

  describe('getGroups', () => {
    it('returns expected group names', () => {
      const groups = getGroups();
      expect(groups).toContain('search');
      expect(groups).toContain('tlds');
      expect(groups).toContain('domains');
      expect(groups).toContain('cart');
      expect(groups).toContain('marketplace');
    });
  });

  describe('buildRouteMap', () => {
    it('maps all tool names', () => {
      const map = buildRouteMap();
      expect(map.size).toBe(COMMAND_ROUTES.length);
      expect(map.get('ud_domains_search')).toBeDefined();
      expect(map.get('ud_cart_checkout')).toBeDefined();
    });
  });

  describe('route coverage against spec', () => {
    let specToolNames: string[];

    beforeAll(async () => {
      const { readFileSync } = await import('node:fs');
      const { resolve } = await import('node:path');
      const { fileURLToPath } = await import('node:url');
      const __dirname = resolve(fileURLToPath(import.meta.url), '..');
      const specPath = resolve(__dirname, '../../src/generated/openapi-spec.json');
      const spec = JSON.parse(readFileSync(specPath, 'utf-8'));
      specToolNames = Object.keys(spec.paths).map((p: string) => p.split('/actions/')[1]).filter(Boolean);
    });

    it('every spec endpoint has a route', () => {
      const routeNames = new Set(COMMAND_ROUTES.map((r) => r.toolName));
      const missing = specToolNames.filter((t) => !routeNames.has(t));
      expect(missing).toEqual([]);
    });

    it('no route references a nonexistent tool', () => {
      const specNames = new Set(specToolNames);
      const extra = COMMAND_ROUTES.filter((r) => !specNames.has(r.toolName));
      expect(extra).toEqual([]);
    });
  });
});
