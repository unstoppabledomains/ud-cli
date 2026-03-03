---
name: ud-cli
description: Domain registrar CLI — search, register, and manage domains via Unstoppable Domains. Use when the user needs domain registration, DNS record management, marketplace listings, cart/checkout, domain transfers, or any domain management task.
allowed-tools: Bash(ud:*)
---

# Domain Management with ud-cli

## Prerequisites

```bash
ud auth login                # OAuth (opens browser)
ud auth login -k <key>       # API key (ud_mcp_ + 64 hex chars)
ud auth status               # Check current auth
```

## Global Options

```
--format json|table|csv      Output format (default: table)
--fields [cols]              Show available fields or select columns (e.g., name,expiresAt)
--data <json>                JSON request body for complex operations
--file <path>                Read JSON request body from file
--domains-file <path>        Read domain list from file (one per line)
--quiet                      Suppress output except errors
--env production|sandbox     Override environment
```

## Commands

### Search & Discovery

```bash
ud search <query>                        # Search for available domains
ud search <query> --tlds com,io --limit 20
ud tlds                                  # List available TLDs
```

### Portfolio

```bash
ud domains list                          # List your domains
ud domains get <domains...>              # Detailed domain info
ud domains push <domains...>             # Transfer to another user (requires --otp-code)
ud domains operations <domains...>       # Check pending operations
```

### Domain Settings

```bash
ud domains tags add <domains...> --tags tag1,tag2
ud domains tags remove <domains...> --tags tag1,tag2
ud domains flags update <domains...>     # WHOIS privacy, transfer lock
ud domains auto-renewal update <domains...> --enabled true|false
```

### DNS Records

```bash
ud domains dns records list <domain>
ud domains dns records add <domain> --type A --values 1.2.3.4
ud domains dns records update            # Update by record ID (use --data)
ud domains dns records remove            # Remove by record ID (use --data)
ud domains dns records remove-all <domains...> --confirm
```

### DNS Nameservers

```bash
ud domains dns nameservers list <domain>
ud domains dns nameservers set-custom    # 2-12 hostnames (use --data)
ud domains dns nameservers set-default   # Re-enable UD DNS management
```

### Hosting

```bash
ud domains hosting redirects list <domain>
ud domains hosting redirects add         # 301/302 redirects (use --data)
ud domains hosting redirects remove      # Remove redirect config
ud domains hosting landers generate <domains...>   # AI landing page
ud domains hosting landers status <domains...>     # Check generation
ud domains hosting landers remove <domains...>     # Remove landing page
```

### ICANN Contacts

```bash
ud domains contacts list                 # List contacts (needed for DNS domain checkout)
ud domains contacts create               # Create ICANN contact (use --data)
```

### Cart

```bash
ud cart add [domain...]                  # Smart add — auto-detects source type
ud cart add registration <domains...>    # Fresh registration
ud cart add listed <domains...>          # UD marketplace listing
ud cart add afternic <domains...>        # Afternic marketplace
ud cart add sedo <domains...>            # Sedo marketplace
ud cart add renewal <domains...>         # Renew owned domains
ud cart get                              # View cart with pricing
ud cart remove                           # Remove items
ud cart checkout --confirm               # Complete purchase
ud cart url                              # Get browser checkout URL
ud cart payment-methods                  # List payment methods
ud cart add-payment-method               # Get URL to add payment method
```

### Marketplace

```bash
ud marketplace listings create <domains...> --price 99.99
ud marketplace listings update           # Update price/settings (use --data)
ud marketplace listings cancel --confirm
ud marketplace offers list
ud marketplace offers respond            # Accept/reject offers (use --data)
ud marketplace leads list
ud marketplace leads get <domain>        # Get or create conversation
ud marketplace leads messages            # List messages (--conversation-id)
ud marketplace leads send                # Send message (--conversation-id --content)
```

## Key Workflows

### Search and Purchase (most common)

Search results include `marketplace.source` and `marketplace.status` — these determine which cart tool to use. See [references/search-and-purchase.md](references/search-and-purchase.md) for the full decision table.

Quick version with smart add:
```bash
ud search mybusiness --format json       # Check availability + marketplace info
ud cart add mybusiness.com mybusiness.io  # Auto-detects correct cart type
ud cart get                              # Review pricing
ud cart checkout --confirm               # Purchase
```

### DNS Domain Registration

DNS domains (.com, .org, .net) require an ICANN contact before checkout.
```bash
ud domains contacts list                 # Check for existing contacts
ud domains contacts create --data '...'  # Create if needed
ud cart add registration example.com
ud cart checkout --confirm
```

### DNS Setup

```bash
ud domains dns nameservers list example.com   # Verify UD nameservers
ud domains dns records list example.com
ud domains dns records add example.com --type A --values 1.2.3.4
ud domains operations example.com             # Track propagation
```

See detailed guides:
- [Search & Purchase](references/search-and-purchase.md)
- [DNS Management](references/dns-management.md)
- [Cart & Checkout](references/cart-and-checkout.md)
- [Marketplace](references/marketplace.md)

## Key Constraints

| Constraint | Limit |
|---|---|
| Max domains per bulk operation | 50 |
| Max search queries per request | 10 |
| Max TLDs per search | 5 (default: com, net, org, ai, io) |
| Prices | In **cents (USD)** — `5000` = $50.00 |
| Registration/renewal quantity | 1–10 years |
| Custom nameservers | 2–12 hostnames; disables DNS record management |

### Safety Confirmations

| Operation | Required Flag |
|---|---|
| `ud cart checkout` | `--confirm` |
| `ud domains dns records remove-all` | `--confirm` |
| `ud marketplace listings cancel` | `--confirm` |
| `ud domains push` | `--otp-code` (6-digit MFA) |

## Error Handling

- **401/403**: Re-authenticate with `ud auth login`
- **Wrong cart tool**: Most common error. Check `marketplace.source` from search results. Use `ud cart add` (smart) to avoid this.
- **Missing ICANN contact**: Required for DNS domains. Create with `ud domains contacts create`.
- **DNS changes not appearing**: Changes are async. Check with `ud domains operations`.
- **Checkout fails with no payment**: Use `ud cart payment-methods` to check, or `ud cart add-payment-method` to add one.
