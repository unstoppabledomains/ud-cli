import { jest } from '@jest/globals';
import { Command } from 'commander';
import { config, clearEnvOverride } from '../../src/lib/config.js';
import { _setStore } from '../../src/lib/credentials.js';
import { createMemoryStore } from '../helpers/memoryStore.js';
import { setupMockFetch, teardownMockFetch, mockFetchRoute, jsonResponse } from '../helpers/mockFetch.js';

async function createTestProgram() {
  jest.resetModules();
  const { program } = await import('../../src/program.js');
  function applyExitOverride(cmd: Command) {
    cmd.exitOverride();
    for (const sub of cmd.commands) applyExitOverride(sub);
  }
  applyExitOverride(program);
  return program;
}

describe('marketplace commands', () => {
  let memStore: ReturnType<typeof createMemoryStore>;
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;
  let program: Command;

  beforeEach(async () => {
    clearEnvOverride();
    config.clear();
    config.set('environment', 'production');
    config.set('environments.production', { authMethod: 'api-key' });
    memStore = createMemoryStore();
    _setStore(memStore);
    await memStore.saveApiKey('ud_mcp_' + 'a'.repeat(64), 'production');
    setupMockFetch();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
    program = await createTestProgram();
  });

  afterEach(() => {
    teardownMockFetch();
    consoleSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  // --- Cart ---

  describe('cart', () => {
    it('cart get calls ud_cart_get', async () => {
      let called = false;
      mockFetchRoute('actions/ud_cart_get', () => {
        called = true;
        return jsonResponse({ items: [], itemCount: 0, pricing: {} });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'get']);
      expect(called).toBe(true);
    });

    it('cart add registration passes domains', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_cart_add_domain_registration', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ addedProducts: [{ domain: 'test.com', success: true, productId: 'p1' }] });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'add', 'registration', 'test.com']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([{ name: 'test.com' }]);
    });

    it('smart cart add searches domain and routes to registration', async () => {
      mockFetchRoute('actions/ud_domains_search', () => {
        return jsonResponse({
          results: [
            { name: 'available.com', available: true, marketplace: { source: 'unstoppable_domains' } },
          ],
        });
      });

      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_cart_add_domain_registration', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ addedProducts: [{ domain: 'available.com', success: true }] });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'add', 'available.com']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([{ name: 'available.com' }]);
    });

    it('smart cart add --type renewal routes to renewal without search', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_cart_add_domain_renewal', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ addedProducts: [{ domain: 'mysite.com', success: true }] });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'add', '--type', 'renewal', 'mysite.com']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domains).toEqual([{ name: 'mysite.com' }]);
    });

    it('smart cart add --type invalid shows error', async () => {
      await program.parseAsync(['node', 'ud', 'cart', 'add', '--type', 'invalid', 'test.com']);

      expect(process.exitCode).toBe(1);
      const output = errorSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('Unknown cart type: invalid');
    });

    it('cart checkout --confirm calls ud_cart_checkout', async () => {
      let called = false;
      mockFetchRoute('actions/ud_cart_checkout', () => {
        called = true;
        return jsonResponse({ orderId: 'ord-1', success: true, summary: { itemCount: 1 } });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'checkout', '--confirm']);
      expect(called).toBe(true);
    });

    it('cart checkout aborts without --confirm in non-TTY', async () => {
      mockFetchRoute('actions/ud_cart_checkout', () => {
        return jsonResponse({});
      });

      await program.parseAsync(['node', 'ud', 'cart', 'checkout']);

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('Aborted');
    });

    it('cart remove calls ud_cart_remove', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_cart_remove', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ removedCount: 1 });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'remove', '--data', '{"productIds":["p1"]}']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.productIds).toEqual(['p1']);
    });

    it('cart payment-methods calls correct endpoint', async () => {
      let called = false;
      mockFetchRoute('actions/ud_cart_get_payment_methods', () => {
        called = true;
        return jsonResponse({ savedCards: [{ id: 'c1', brand: 'visa', last4: '4242' }] });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'payment-methods']);
      expect(called).toBe(true);
    });

    it('cart url returns checkout URL', async () => {
      let called = false;
      mockFetchRoute('actions/ud_cart_get_url', () => {
        called = true;
        return jsonResponse({ checkoutUrl: 'https://ud.me/checkout/abc' });
      });

      await program.parseAsync(['node', 'ud', 'cart', 'url']);
      expect(called).toBe(true);
    });
  });

  // --- Listings ---

  describe('listings', () => {
    it('listings create passes domains with domainName wrapping key', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_listing_create', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ results: [{ domain: 'sell.com', success: true, listingId: 'l1' }] });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'listings', 'create', 'sell.com']);

      expect(capturedBody).toBeTruthy();
      const domains = capturedBody!.domains as Record<string, unknown>[];
      expect(domains).toHaveLength(1);
      expect(domains[0].domainName).toBe('sell.com');
    });

    it('listings create --price 99.99 converts to priceInCents 9999', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_listing_create', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ results: [{ domain: 'sell.com', success: true, listingId: 'l1' }] });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'listings', 'create', 'sell.com', '--price', '99.99']);

      expect(capturedBody).toBeTruthy();
      const domains = capturedBody!.domains as Record<string, unknown>[];
      expect(domains[0].priceInCents).toBe(9999);
    });

    it('listings cancel calls ud_listing_cancel with --confirm', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_listing_cancel', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ results: [{ listingId: 'l1', success: true }] });
      });

      await program.parseAsync([
        'node', 'ud', 'marketplace', 'listings', 'cancel', '--confirm',
        '--data', '{"listingIds":["l1"]}',
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.listingIds).toEqual(['l1']);
    });

    it('listings cancel aborts without --confirm in non-TTY', async () => {
      mockFetchRoute('actions/ud_listing_cancel', () => {
        return jsonResponse({});
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'listings', 'cancel', '--data', '{"listingIds":["l1"]}']);

      const output = consoleSpy.mock.calls.map((c: unknown[]) => String(c[0])).join('\n');
      expect(output).toContain('Aborted');
    });
  });

  // --- Offers ---

  describe('offers', () => {
    it('offers list calls correct endpoint', async () => {
      let called = false;
      mockFetchRoute('actions/ud_offers_list', () => {
        called = true;
        return jsonResponse({ offers: [{ domainName: 'offer.com', amount: 1000, status: 'pending' }] });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'offers', 'list']);
      expect(called).toBe(true);
    });

    it('offers respond passes offer IDs and action via --data', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_offer_respond', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ results: [{ offerId: 'o1', success: true }] });
      });

      await program.parseAsync([
        'node', 'ud', 'marketplace', 'offers', 'respond',
        '--data', '{"offers":[{"offerId":"o1","action":"accept"}]}',
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.offers).toEqual([{ offerId: 'o1', action: 'accept' }]);
    });
  });

  // --- Leads ---

  describe('leads', () => {
    it('leads list calls correct endpoint', async () => {
      let called = false;
      mockFetchRoute('actions/ud_leads_list', () => {
        called = true;
        return jsonResponse({ leads: [{ domain: 'lead.com', status: 'active' }] });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'leads', 'list']);
      expect(called).toBe(true);
    });

    it('leads get passes domain positional', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_lead_get', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ conversation: { id: 'c1', domainName: 'lead.com' }, message: 'Started' });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'leads', 'get', 'lead.com']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.domain).toBe('lead.com');
    });

    it('leads messages passes conversationId', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_lead_messages_list', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ messages: [{ id: 'm1', content: 'Hello' }] });
      });

      await program.parseAsync(['node', 'ud', 'marketplace', 'leads', 'messages', '--conversation-id', '42']);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.conversationId).toBe(42);
    });

    it('leads send passes conversationId and content', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_lead_message_send', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ id: 'm2', content: 'Reply', createdAt: '2026-03-02T00:00:00Z' });
      });

      await program.parseAsync([
        'node', 'ud', 'marketplace', 'leads', 'send',
        '--conversation-id', '42', '--content', 'Reply',
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.conversationId).toBe(42);
      expect(capturedBody!.content).toBe('Reply');
    });
  });

  // --- Contacts ---

  describe('contacts', () => {
    it('contacts list calls correct endpoint', async () => {
      let called = false;
      mockFetchRoute('actions/ud_contacts_list', () => {
        called = true;
        return jsonResponse({ contacts: [{ id: 'ct1', firstName: 'John', lastName: 'Doe' }] });
      });

      await program.parseAsync(['node', 'ud', 'domains', 'contacts', 'list']);
      expect(called).toBe(true);
    });

    it('contacts create passes required fields via --data', async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetchRoute('actions/ud_contact_create', (_url, init) => {
        capturedBody = JSON.parse(init?.body as string);
        return jsonResponse({ id: 'ct2', firstName: 'Jane' });
      });

      await program.parseAsync([
        'node', 'ud', 'domains', 'contacts', 'create',
        '--data', '{"firstName":"Jane","lastName":"Doe","email":"jane@example.com"}',
      ]);

      expect(capturedBody).toBeTruthy();
      expect(capturedBody!.firstName).toBe('Jane');
      expect(capturedBody!.email).toBe('jane@example.com');
    });
  });
});
