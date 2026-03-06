# ud-cli

Unstoppable Domains CLI — Search, register, and manage your domains from the command line.

## Quick Start

```bash
# Install (macOS / Linux) — may prompt for sudo
curl -fsSL https://raw.githubusercontent.com/unstoppabledomains/ud-cli/main/install.sh | sh

# Or install via npm
npm install -g @unstoppabledomains/ud-cli

# Create an account (or use ud auth login to sign in)
ud auth signup

# You're ready — try it out
ud search mybusiness
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

### Signup (create account)

```bash
ud auth signup
```

Creates a new account directly from the terminal. Prompts for email and password, sends a verification code to your email, and signs you in — no browser needed.

For scripting or headless environments, pass credentials as flags:

```bash
# Step 1: Create account (outputs the verify command to stdout)
ud auth signup --email user@example.com --password 'SecurePass1!'

# Step 2: Verify with the code from your email
ud auth signup --token <session_token> --code ABC123
```

### OAuth (browser-based)

```bash
ud auth login
```

Opens a browser for authorization using OAuth 2.0 with PKCE. Use this to sign in to an existing account. Tokens are automatically refreshed.

### API Key

```bash
ud auth login --key ud_mcp_<64-hex-chars>
```

API keys have the format `ud_mcp_` followed by 64 hex characters. Generate one from the Unstoppable Domains dashboard. Passing `--key` automatically selects the api-key method.

### Managing credentials

```bash
ud auth status    # Check current auth status
ud auth logout    # Clear stored credentials
```

## Global Options

| Option | Description |
|--------|-------------|
| `--env <environment>` | Override active environment (`production` or `sandbox`) |
| `--format <format>` | Output format: `table` (default), `json`, or `csv` |
| `--fields [columns]` | Show available fields, or specify columns to display |
| `--quiet` | Suppress output except errors |
| `--verbose` | Show detailed output |
| `--profile <name>` | Configuration profile to use (reserved) |

### Output Formats

```bash
# Table output (default) — human-readable
ud search mybusiness

# JSON output — for scripting and piping
ud search mybusiness --format json

# CSV output — for spreadsheets and data processing
ud tlds --format csv > tlds.csv
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

```
ud
├── auth
│   ├── signup                        Create a new account
│   ├── login                         Authenticate (OAuth or API key)
│   ├── logout                        Clear stored credentials
│   └── status                        Check current auth status
├── cart
│   ├── add [domain...]               Smart add (auto-detects source)
│   │   ├── afternic <domains...>     Add Afternic marketplace domains
│   │   ├── listed <domains...>       Add marketplace-listed domains
│   │   ├── registration <domains...> Add domains for registration
│   │   ├── renewal <domains...>      Add domain renewals
│   │   └── sedo <domains...>         Add Sedo marketplace domains
│   ├── checkout                      Complete cart checkout
│   ├── list                          List shopping cart with pricing
│   ├── payment-methods
│   │   ├── add                       Get URL to add payment method
│   │   └── list                      List available payment methods
│   ├── remove                        Remove items from cart
│   └── url                           Get checkout URL
├── completion                        Generate shell completion scripts
├── config
│   ├── get [command]                 Show saved defaults
│   ├── reset <command> [key]         Remove saved defaults
│   └── set <command> <key> <value>   Save a default option
├── domains
│   ├── auto-renewal
│   │   └── update <domains...>       Toggle auto-renewal
│   ├── contacts
│   │   ├── create                    Create ICANN contact
│   │   └── list                      List ICANN contacts
│   ├── dns
│   │   ├── nameservers
│   │   │   ├── set-custom            Set custom nameservers
│   │   │   ├── set-default           Reset to default nameservers
│   │   │   └── show <domain>         Show nameservers
│   │   └── records
│   │       ├── add <domain>          Add DNS records
│   │       ├── remove                Remove DNS records
│   │       ├── remove-all <domains...>  Remove all DNS records
│   │       ├── show <domain>         Show DNS records
│   │       └── update                Update DNS records
│   ├── flags
│   │   └── update <domains...>       Update domain flags
│   ├── get <domains...>              Get detailed domain info
│   ├── hosting
│   │   ├── landers
│   │   │   ├── generate <domains...> Generate AI landing page
│   │   │   ├── remove <domains...>   Remove AI landing page
│   │   │   └── show <domains...>     Show lander status
│   │   └── redirects
│   │       ├── add                   Add redirect configuration
│   │       ├── remove                Remove redirect configuration
│   │       └── show <domain>         Show redirect configurations
│   ├── list                          List portfolio domains
│   ├── operations
│   │   └── show <domains...>         Show pending operations
│   ├── push <domains...>             Push domains to another user
│   └── tags
│       ├── add <domains...>          Add tags to domains
│       └── remove <domains...>       Remove tags from domains
├── env
│   ├── set <environment>             Switch default environment
│   └── show                          Show current environment
├── install                           Install shell completions (+ --skills for agent skill)
├── marketplace
│   ├── leads
│   │   ├── list                      List domain conversation leads
│   │   ├── messages
│   │   │   ├── list                  List messages in a conversation
│   │   │   └── send                  Send a message in a conversation
│   │   └── open <domain>             Inquire about a domain
│   ├── listings
│   │   ├── cancel                    Cancel listings
│   │   ├── create <domains...>       Create marketplace listings
│   │   └── update                    Update marketplace listings
│   └── offers
│       ├── list                      List marketplace offers
│       └── respond                   Respond to marketplace offers
├── search <query>                    Search for available domains
├── tlds                              List available TLDs
└── update
    └── check                         Check for updates
```

### Search & Discovery

```
ud search <query>                     Search for available domains
ud tlds                               List available TLDs
```

### Domains

```
ud domains list                       List portfolio domains
ud domains get <domains...>           Get detailed domain info
ud domains push <domains...>          Push domains to another user
ud domains operations show <domains...>  Show pending operations
ud domains tags add <domains...>      Add tags to domains
ud domains tags remove <domains...>   Remove tags from domains
ud domains flags update <domains...>  Update domain flags
ud domains auto-renewal update <domains...>  Toggle auto-renewal
ud domains contacts list              List ICANN contacts
ud domains contacts create            Create ICANN contact
```

#### DNS (`ud domains dns`)

```
ud domains dns records show <domain>          Show DNS records
ud domains dns records add <domain>           Add DNS records
ud domains dns records update                 Update DNS records
ud domains dns records remove                 Remove DNS records
ud domains dns records remove-all <domains...>  Remove all DNS records
ud domains dns nameservers show <domain>      Show nameservers
ud domains dns nameservers set-custom         Set custom nameservers
ud domains dns nameservers set-default        Reset to default nameservers
```

#### Hosting (`ud domains hosting`)

```
ud domains hosting redirects show <domain>             Show redirect configurations
ud domains hosting redirects add                       Add redirect configuration
ud domains hosting redirects remove                    Remove redirect configuration
ud domains hosting landers generate <domains...>       Generate AI landing page
ud domains hosting landers show <domains...>           Show lander status
ud domains hosting landers remove <domains...>         Remove AI landing page
```

### Cart

```
ud cart list                          List shopping cart with pricing
ud cart remove                        Remove items from cart
ud cart checkout                      Complete cart checkout (requires --confirm)
ud cart url                           Get checkout URL
ud cart payment-methods list          List available payment methods
ud cart payment-methods add           Get URL to add payment method
ud cart add [domain...]               Smart add — auto-detects source and routes
ud cart add registration <domains...> Add domains for registration
ud cart add listed <domains...>       Add marketplace-listed domains
ud cart add afternic <domains...>     Add Afternic marketplace domains
ud cart add sedo <domains...>         Add Sedo marketplace domains
ud cart add renewal <domains...>      Add domain renewals
```

### Marketplace

```
ud marketplace listings create <domains...>       Create marketplace listings
ud marketplace listings create <domains...> --price 99.99  Set listing price
ud marketplace listings update                    Update marketplace listings
ud marketplace listings update --price 50.00      Update listing price
ud marketplace listings cancel                    Cancel listings (requires --confirm)
ud marketplace offers list                        List marketplace offers
ud marketplace offers respond                     Respond to marketplace offers
ud marketplace leads list                         List domain conversation leads
ud marketplace leads open <domain>                Inquire about a domain
ud marketplace leads messages list                List messages in a conversation
ud marketplace leads messages send                Send a message in a conversation
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
ud config set "domains dns records show" format json

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
ud search mybusiness --tlds com,org,io --limit 10

# Smart cart add — auto-detects the source type
ud cart add mybusiness.com mybusiness.io

# Or specify the type explicitly
ud cart add registration mybusiness.com mybusiness.io
ud cart add --type renewal mysite.com

# Review cart and checkout
ud cart list
ud cart checkout --confirm
```

### Manage DNS records

```bash
# List current records
ud domains dns records show example.com --format json

# Add an A record (single-item shorthand)
ud domains dns records add example.com --type A --values 1.2.3.4

# Bulk operations with --data
ud domains dns records add example.com --data '{
  "records": [
    {"domain": "example.com", "type": "A", "values": ["1.2.3.4"]},
    {"domain": "example.com", "type": "CNAME", "subName": "www", "values": ["example.com"]}
  ]
}'
```

### Marketplace listings

```bash
# List a domain for sale at $99.99
ud marketplace listings create mydomain.com --price 99.99

# Update listing price
ud marketplace listings update --price 50.00 --data '{"listings":[{"listingId":"l123"}]}'

# Cancel a listing
ud marketplace listings cancel --confirm --data '{"listingIds":["l123"]}'

# View and respond to offers
ud marketplace offers list
ud marketplace offers respond --data '{"offers":[{"offerId":"o123","action":"accept"}]}'

# Manage leads
ud marketplace leads list
ud marketplace leads open mydomain.com
ud marketplace leads messages list --conversation-id 42
ud marketplace leads messages send --conversation-id 42 --content "Thanks for your interest!"
```

### Advanced usage

```bash
# Use --data for complex request bodies
ud domains contacts create --data '{
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
ud domains dns records add example.com --file records.json

# Pipe JSON output for scripting
ud domains list --format json | jq '.domains[].name'
```

## Agent Skills

ud-cli ships a skill that teaches coding agents (Claude Code, Cursor, GitHub Copilot, etc.) how to use domain management commands.

### Install via npx skills (recommended)

Works with 40+ agents, no prior install needed:

```bash
npx skills add unstoppabledomains/ud-cli
```

### Install via ud-cli

If you already have the CLI installed:

```bash
ud install --skills
```

Both methods copy the skill to `.claude/skills/ud-cli/` (or the equivalent for your agent). The skill covers search, DNS, cart, marketplace, and all other ud-cli workflows.

The `ud install` command also sets up shell tab-completion (auto-detects your shell). Use `--skills-target <dir>` to install to a specific directory instead of the current one.

For skills-less operation, agents can also read `ud --help` directly.

## Environments

| Environment | Base URL |
|-------------|----------|
| `production` (default) | `https://api.unstoppabledomains.com` |
| `sandbox` | `https://api.ud-sandbox.com` |

```bash
ud env show              # Show current environment
ud env set sandbox       # Switch default environment
ud --env sandbox <cmd>   # Override environment for a single command
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
