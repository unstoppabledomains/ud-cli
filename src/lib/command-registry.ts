/**
 * Static command routing table that maps API tool names to CLI command hierarchy.
 *
 * Each route defines:
 * - The tool name (matches the OpenAPI spec endpoint)
 * - The CLI path as [group, subgroup?, command]
 * - Optional positional arguments
 */

export interface PositionalArg {
  name: string;
  description: string;
  required: boolean;
  variadic: boolean; // e.g. <domains...>
}

export interface CommandRoute {
  toolName: string;
  path: string[]; // e.g. ['domains', 'search'] → `ud domains search`
  positionalArgs: PositionalArg[];
  description?: string; // override spec summary for CLI
}

export const COMMAND_ROUTES: CommandRoute[] = [
  // --- Domain Search ---
  {
    toolName: 'ud_domains_search',
    path: ['domains', 'search'],
    positionalArgs: [
      { name: 'query', description: 'Domain name or search term', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_tld_list',
    path: ['domains', 'tlds'],
    positionalArgs: [],
  },

  // --- Portfolio ---
  {
    toolName: 'ud_portfolio_list',
    path: ['domains', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_domain_get',
    path: ['domains', 'get'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },

  // --- Domain Management ---
  {
    toolName: 'ud_domain_push',
    path: ['domains', 'push'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s) to push', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_pending_operations',
    path: ['domains', 'operations'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_tags_add',
    path: ['domains', 'tags', 'add'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_tags_remove',
    path: ['domains', 'tags', 'remove'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_flags_update',
    path: ['domains', 'flags', 'update'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_auto_renewal_update',
    path: ['domains', 'auto-renewal', 'update'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },

  // --- AI Lander ---
  {
    toolName: 'ud_domain_generate_lander',
    path: ['domains', 'lander', 'generate'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_lander_status',
    path: ['domains', 'lander', 'status'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_domain_remove_lander',
    path: ['domains', 'lander', 'remove'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },

  // --- DNS Records ---
  {
    toolName: 'ud_dns_records_list',
    path: ['dns', 'records', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_record_add',
    path: ['dns', 'records', 'add'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_record_update',
    path: ['dns', 'records', 'update'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_record_remove',
    path: ['dns', 'records', 'remove'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_records_remove_all',
    path: ['dns', 'records', 'remove-all'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },

  // --- DNS Nameservers ---
  {
    toolName: 'ud_dns_nameservers_list',
    path: ['dns', 'nameservers', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_nameservers_set_custom',
    path: ['dns', 'nameservers', 'set-custom'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_nameservers_set_default',
    path: ['dns', 'nameservers', 'set-default'],
    positionalArgs: [],
  },

  // --- DNS Hosting ---
  {
    toolName: 'ud_dns_hosting_list',
    path: ['dns', 'hosting', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_hosting_add',
    path: ['dns', 'hosting', 'add'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_hosting_remove',
    path: ['dns', 'hosting', 'remove'],
    positionalArgs: [],
  },

  // --- Cart ---
  {
    toolName: 'ud_cart_get',
    path: ['cart', 'get'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_remove',
    path: ['cart', 'remove'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_checkout',
    path: ['cart', 'checkout'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_get_url',
    path: ['cart', 'url'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_get_payment_methods',
    path: ['cart', 'payment-methods'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_add_payment_method_url',
    path: ['cart', 'add-payment-method'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_cart_add_domain_registration',
    path: ['cart', 'add', 'registration'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s) to register', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_cart_add_domain_listed',
    path: ['cart', 'add', 'listed'],
    positionalArgs: [
      { name: 'domains', description: 'Listed domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_cart_add_domain_afternic',
    path: ['cart', 'add', 'afternic'],
    positionalArgs: [
      { name: 'domains', description: 'Afternic domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_cart_add_domain_sedo',
    path: ['cart', 'add', 'sedo'],
    positionalArgs: [
      { name: 'domains', description: 'Sedo domain name(s)', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_cart_add_domain_renewal',
    path: ['cart', 'add', 'renewal'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s) to renew', required: true, variadic: true },
    ],
  },

  // --- Contacts ---
  {
    toolName: 'ud_contacts_list',
    path: ['contacts', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_contact_create',
    path: ['contacts', 'create'],
    positionalArgs: [],
  },

  // --- Listings / Marketplace ---
  {
    toolName: 'ud_listing_create',
    path: ['listings', 'create'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s) to list', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_listing_update',
    path: ['listings', 'update'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_listing_cancel',
    path: ['listings', 'cancel'],
    positionalArgs: [],
  },

  // --- Offers ---
  {
    toolName: 'ud_offers_list',
    path: ['offers', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_offer_respond',
    path: ['offers', 'respond'],
    positionalArgs: [],
  },

  // --- Leads ---
  {
    toolName: 'ud_leads_list',
    path: ['leads', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_lead_get',
    path: ['leads', 'get'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_lead_messages_list',
    path: ['leads', 'messages'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_lead_message_send',
    path: ['leads', 'send'],
    positionalArgs: [],
  },
];

/**
 * Returns the set of unique top-level group names.
 */
export function getGroups(): string[] {
  const groups = new Set<string>();
  for (const route of COMMAND_ROUTES) {
    groups.add(route.path[0]);
  }
  return [...groups];
}

/**
 * Builds a lookup map from toolName → CommandRoute.
 */
export function buildRouteMap(): Map<string, CommandRoute> {
  const map = new Map<string, CommandRoute>();
  for (const route of COMMAND_ROUTES) {
    map.set(route.toolName, route);
  }
  return map;
}
