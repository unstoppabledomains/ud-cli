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
  // --- Search & Discovery (root-level commands) ---
  {
    toolName: 'ud_domains_search',
    path: ['search'],
    positionalArgs: [
      { name: 'query', description: 'Domain name or search term', required: true, variadic: false },
    ],
    description: 'Search for available domains',
  },
  {
    toolName: 'ud_tld_list',
    path: ['tlds'],
    positionalArgs: [],
    description: 'List available TLDs',
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

  // --- DNS Records ---
  {
    toolName: 'ud_dns_records_list',
    path: ['domains', 'dns', 'records', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_record_add',
    path: ['domains', 'dns', 'records', 'add'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_record_update',
    path: ['domains', 'dns', 'records', 'update'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_record_remove',
    path: ['domains', 'dns', 'records', 'remove'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_records_remove_all',
    path: ['domains', 'dns', 'records', 'remove-all'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
  },

  // --- DNS Nameservers ---
  {
    toolName: 'ud_dns_nameservers_list',
    path: ['domains', 'dns', 'nameservers', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_nameservers_set_custom',
    path: ['domains', 'dns', 'nameservers', 'set-custom'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_nameservers_set_default',
    path: ['domains', 'dns', 'nameservers', 'set-default'],
    positionalArgs: [],
  },

  // --- Hosting: Redirects ---
  {
    toolName: 'ud_dns_hosting_list',
    path: ['domains', 'hosting', 'redirects', 'list'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_dns_hosting_add',
    path: ['domains', 'hosting', 'redirects', 'add'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_dns_hosting_remove',
    path: ['domains', 'hosting', 'redirects', 'remove'],
    positionalArgs: [],
  },

  // --- Hosting: AI Landers ---
  {
    toolName: 'ud_domain_generate_lander',
    path: ['domains', 'hosting', 'landers', 'generate'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
    description: 'Generate AI landing page for domains',
  },
  {
    toolName: 'ud_domain_lander_status',
    path: ['domains', 'hosting', 'landers', 'status'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
    description: 'Check AI lander generation status',
  },
  {
    toolName: 'ud_domain_remove_lander',
    path: ['domains', 'hosting', 'landers', 'remove'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s)', required: true, variadic: true },
    ],
    description: 'Remove AI landing page from domains',
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
    path: ['domains', 'contacts', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_contact_create',
    path: ['domains', 'contacts', 'create'],
    positionalArgs: [],
  },

  // --- Marketplace: Listings ---
  {
    toolName: 'ud_listing_create',
    path: ['marketplace', 'listings', 'create'],
    positionalArgs: [
      { name: 'domains', description: 'Domain name(s) to list', required: true, variadic: true },
    ],
  },
  {
    toolName: 'ud_listing_update',
    path: ['marketplace', 'listings', 'update'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_listing_cancel',
    path: ['marketplace', 'listings', 'cancel'],
    positionalArgs: [],
  },

  // --- Marketplace: Offers ---
  {
    toolName: 'ud_offers_list',
    path: ['marketplace', 'offers', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_offer_respond',
    path: ['marketplace', 'offers', 'respond'],
    positionalArgs: [],
  },

  // --- Marketplace: Leads ---
  {
    toolName: 'ud_leads_list',
    path: ['marketplace', 'leads', 'list'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_lead_get',
    path: ['marketplace', 'leads', 'get'],
    positionalArgs: [
      { name: 'domain', description: 'Domain name', required: true, variadic: false },
    ],
  },
  {
    toolName: 'ud_lead_messages_list',
    path: ['marketplace', 'leads', 'messages'],
    positionalArgs: [],
  },
  {
    toolName: 'ud_lead_message_send',
    path: ['marketplace', 'leads', 'send'],
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
