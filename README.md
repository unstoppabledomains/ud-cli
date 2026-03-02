# ud-cli

CLI tool for managing Unstoppable Domains — domain portfolio, DNS records, marketplace listings, and more.

## Quick Start

```bash
# Install dependencies
npm install

# Authenticate (opens browser for OAuth)
npx tsx src/index.ts auth login

# Check auth status
npx tsx src/index.ts auth whoami

# Switch environments
npx tsx src/index.ts env set staging
npx tsx src/index.ts --env staging auth login
```

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
```

## Building Binaries

```bash
npm run bundle              # Bundle into single file (dist/ud-cli.cjs)
npm run build:binaries      # Create standalone executables in bin/
```

Binary targets: macOS (arm64, x64), Linux (x64), Windows (x64).

## Credential Storage

Credentials are stored securely:
- **Primary:** System keychain via `keytar` (macOS Keychain, Windows Credential Vault, Linux Secret Service)
- **Fallback:** Plaintext JSON file at `~/.ud-cli/credentials-{env}.json` with permissions `0600` when native keychain is unavailable
