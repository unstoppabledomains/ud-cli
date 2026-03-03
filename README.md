# ud-cli

Unstoppable Domains CLI — Search, register, and manage your domains from the command line.

## Quick Start

```bash
# Install (macOS / Linux) — may prompt for sudo
curl -fsSL https://raw.githubusercontent.com/unstoppabledomains/ud-cli/main/install.sh | sh

# Or install via npm
npm install -g @unstoppabledomains/ud-cli

# Authenticate (opens browser for OAuth)
ud auth login

# You're ready — try it out
ud domains search mybusiness
```

## Updating

```bash
# Check for updates
ud update check

# Update to the latest version
ud update
```

The CLI also checks for updates automatically once every 24 hours and prints a notification if a newer version is available.

## Authentication

### OAuth (default, browser-based)

```bash
ud auth login
```

Opens a browser for authorization using OAuth 2.0 with PKCE. Tokens are automatically refreshed.

### API Key

```bash
ud auth login --key ud_mcp_<64-hex-chars>
```

API keys have the format `ud_mcp_` followed by 64 hex characters. Generate one from the Unstoppable Domains dashboard. Passing `--key` automatically selects the api-key method.

### Managing credentials

```bash
ud auth whoami    # Check current auth status
ud auth logout    # Clear stored credentials
```

## Global Options

| Option | Description |
|--------|-------------|
| `--env <environment>` | Override active environment (`production` or `staging`) |
| `--format <format>` | Output format: `table` (default), `json`, or `csv` |
| `--fields [columns]` | Show available fields, or specify columns to display |
| `--quiet` | Suppress output except errors |
| `--verbose` | Show detailed output |
| `--profile <name>` | Configuration profile to use (reserved) |

### Output Formats

```bash
# Table output (default) — human-readable
ud domains search mybusiness

# JSON output — for scripting and piping
ud domains search mybusiness --format json

# CSV output — for spreadsheets and data processing
ud domains tlds --format csv > tlds.csv
```

### Field Selection

Use `--fields` to customize which columns are displayed in table output.

```bash
# Show available fields for a command
ud domains list --fields

# Select specific columns
ud domains list --fields name,expiresAt,offersCount

# Nested fields use dot notation
ud domains list --fields name,listing.price,autoRenewal.status
```

Invalid field names are rejected with an error and a hint to run `--fields` for the full list.

## Command Reference

### Domains

```
ud domains search <query>             Search for available domains
ud domains tlds                       List available TLDs
ud domains list                       List portfolio domains
ud domains get <domains...>           Get detailed domain info
ud domains push <domains...>          Push domains to another user
ud domains operations <domains...>    Get pending operations
ud domains tags add <domains...>      Add tags to domains
ud domains tags remove <domains...>   Remove tags from domains
ud domains flags update <domains...>  Update domain flags
ud domains auto-renewal update <domains...>  Toggle auto-renewal
```

### DNS

```
ud dns records list <domain>          List DNS records
ud dns records add <domain>           Add DNS records
ud dns records update                 Update DNS records
ud dns records remove                 Remove DNS records
ud dns records remove-all <domains...>  Remove all DNS records
ud dns nameservers list <domain>      List nameservers
ud dns nameservers set-custom         Set custom nameservers
ud dns nameservers set-default        Reset to default nameservers
```

### Hosting

```
ud hosting redirects list <domain>             List redirect configurations
ud hosting redirects add                       Add redirect configuration
ud hosting redirects remove                    Remove redirect configuration
ud hosting landers generate <domains...>       Generate AI landing page
ud hosting landers status <domains...>         Check lander generation status
ud hosting landers remove <domains...>         Remove AI landing page
```

### Cart

```
ud cart get                           Get shopping cart with pricing
ud cart remove                        Remove items from cart
ud cart checkout                      Complete cart checkout (requires --confirm)
ud cart url                           Get checkout URL
ud cart payment-methods               Get available payment methods
ud cart add-payment-method            Get URL to add payment method
ud cart add [domain...]               Smart add — auto-detects source and routes
ud cart add registration <domains...> Add domains for registration
ud cart add listed <domains...>       Add marketplace-listed domains
ud cart add afternic <domains...>     Add Afternic marketplace domains
ud cart add sedo <domains...>         Add Sedo marketplace domains
ud cart add renewal <domains...>      Add domain renewals
```

### Contacts

```
ud contacts list                      List ICANN contacts
ud contacts create                    Create ICANN contact
```

### Listings

```
ud listings create <domains...>       Create marketplace listings
ud listings create <domains...> --price 99.99  Set listing price in dollars
ud listings update                    Update marketplace listings
ud listings update --price 50.00      Update listing price in dollars
ud listings cancel                    Cancel marketplace listings (requires --confirm)
```

### Offers

```
ud offers list                        List marketplace offers
ud offers respond                     Respond to marketplace offers
```

### Leads

```
ud leads list                         List domain conversation leads
ud leads get <domain>                 Get or create domain conversation
ud leads messages                     List messages in a conversation
ud leads send                         Send a message in a conversation
```

### Config

```
ud config set <command> <key> <value>  Save a default option for a command
ud config get [command]                Show saved defaults
ud config reset <command> [key]        Remove saved defaults
```

Per-command defaults let you persist `--fields`, `--format`, and `--quiet` preferences so you don't have to retype them. CLI flags always override saved defaults.

```bash
# Save default fields for domains list
ud config set "domains list" fields name,expiresAt,offersCount

# Now ud domains list automatically uses those fields
ud domains list

# CLI flags still override the saved default
ud domains list --fields name,expiresAt

# Save a default output format
ud config set "dns records list" format json

# View all saved defaults
ud config get

# Remove a specific default
ud config reset "domains list" fields

# Remove all defaults for a command
ud config reset "domains list"
```

When you pass `--fields` explicitly, the CLI shows a tip with the command to save those fields as default.

## Usage Examples

### Search and register domains

```bash
# Search for domains
ud domains search mybusiness --tlds com,org,io --limit 10

# Smart cart add — auto-detects the source type
ud cart add mybusiness.com mybusiness.io

# Or specify the type explicitly
ud cart add registration mybusiness.com mybusiness.io
ud cart add --type renewal mysite.com

# Review cart and checkout
ud cart get
ud cart checkout --confirm
```

### Manage DNS records

```bash
# List current records
ud dns records list example.com --format json

# Add an A record (single-item shorthand)
ud dns records add example.com --type A --values 1.2.3.4

# Bulk operations with --data
ud dns records add example.com --data '{
  "records": [
    {"domain": "example.com", "type": "A", "values": ["1.2.3.4"]},
    {"domain": "example.com", "type": "CNAME", "subName": "www", "values": ["example.com"]}
  ]
}'
```

### Marketplace listings

```bash
# List a domain for sale at $99.99
ud listings create mydomain.com --price 99.99

# Update listing price
ud listings update --price 50.00 --data '{"listings":[{"listingId":"l123"}]}'

# Cancel a listing
ud listings cancel --confirm --data '{"listingIds":["l123"]}'

# View and respond to offers
ud offers list
ud offers respond --data '{"offers":[{"offerId":"o123","action":"accept"}]}'

# Manage leads
ud leads list
ud leads get mydomain.com
ud leads messages --conversation-id 42
ud leads send --conversation-id 42 --content "Thanks for your interest!"
```

### Advanced usage

```bash
# Use --data for complex request bodies
ud contacts create --data '{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "phone": {"dialingPrefix": "+1", "number": "5551234567"},
  "street": "123 Main St",
  "city": "Austin",
  "stateProvince": "TX",
  "postalCode": "78701",
  "countryCode": "US"
}'

# Read request body from a file
ud dns records add example.com --file records.json

# Pipe JSON output for scripting
ud domains list --format json | jq '.domains[].name'
```

## Environments

| Environment | Base URL |
|-------------|----------|
| `production` (default) | `https://api.unstoppabledomains.com` |
| `staging` | `https://api.ud-staging.com` |

```bash
ud env show              # Show current environment
ud env set staging       # Switch default environment
ud --env staging <cmd>   # Override environment for a single command
```

Credentials are stored per-environment, so you can be authenticated to both simultaneously.

## Development

```bash
npm run build          # Compile TypeScript to dist/
npm run typecheck      # Type-check without emitting
npm run lint           # Run ESLint
npm run format         # Format with Prettier
npm test               # Run tests
npm run dev -- --help  # Run CLI in development mode
npm run fetch-spec     # Re-download OpenAPI spec from production API
```

### Updating the API Spec

The CLI commands are auto-generated from the OpenAPI spec at `src/generated/openapi-spec.json`. To update after API changes:

```bash
npm run fetch-spec     # Downloads latest spec
npm test               # Verify everything still works
```

## Building Binaries

```bash
npm run bundle              # Bundle into single file (dist/ud-cli.cjs)
npm run build:binaries      # Create standalone executables in bin/
```

Binary targets: macOS (arm64, x64), Linux (x64), Windows (x64).

## Building from Source

```bash
git clone https://github.com/unstoppabledomains/ud-cli.git
cd ud-cli
npm install
npm run build
npm install -g .
```

## Credential Storage

Credentials are stored securely:
- **Primary:** System keychain via `keytar` (macOS Keychain, Windows Credential Vault, Linux Secret Service)
- **Fallback:** Plaintext JSON file at `~/.ud-cli/credentials-{env}.json` with permissions `0600` when native keychain is unavailable
