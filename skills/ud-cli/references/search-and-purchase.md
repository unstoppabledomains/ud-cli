# Search & Purchase Domains

The most common workflow: search for domains, add to cart, and purchase.

## Quick Path (Smart Add)

`ud cart add` auto-detects the marketplace source, so you can skip the decision table:

```bash
ud search mybusiness --format json
ud cart add mybusiness.com mybusiness.io
ud cart list
ud cart checkout --confirm
```

## Full Decision Table

After `ud search`, each result includes `marketplace.source` and `marketplace.status`. These determine which cart command to use:

| `marketplace.source` | `marketplace.status` | Cart command |
|---|---|---|
| `unstoppable_domains` | `available` | `ud cart add registration <domain>` |
| `unstoppable_domains` | `registered-listed-for-sale` | `ud cart add listed <domain>` |
| `unstoppable_domains` | `registered-listed-for-offers` | Cannot cart. Direct user to `purchaseUrl` to make an offer. |
| `afternic` | `registered-listed-for-sale` | `ud cart add afternic <domain>` |
| `sedo` | `registered-listed-for-sale` | `ud cart add sedo <domain>` |
| any | `registered-not-for-sale` | Not purchasable. Contact seller via `ud marketplace leads open <domain>`. |
| any | `unavailable` or `invalid` | Not purchasable. Suggest alternatives. |

Using the wrong cart command is the most common error. Smart `ud cart add` avoids this.

## Step-by-Step

### 1. Search

```bash
# Basic search
ud search mybusiness

# With options
ud search mybusiness --tlds com,io,org --limit 20

# JSON for scripting
ud search mybusiness --format json
```

Default TLDs when none specified: com, net, org, ai, io. Max 5 TLDs, max 10 queries per request.

### 2. Add to Cart

```bash
# Smart add (recommended) — auto-detects source
ud cart add mybusiness.com mybusiness.io

# Or explicit type
ud cart add registration mybusiness.com
ud cart add listed premium-domain.com
ud cart add afternic afternic-domain.com
ud cart add sedo sedo-domain.com

# Renewals (domains you already own)
ud cart add renewal mysite.com --quantity 2   # 2-year renewal

# Multi-year registration
ud cart add registration mybusiness.com --quantity 3
```

### 3. Review Cart

```bash
ud cart list
```

All prices are in **cents (USD)**: `5000` = $50.00.

### 4. Payment

```bash
# Check available payment methods
ud cart payment-methods list

# Add a payment method if needed
ud cart payment-methods add   # Returns URL to add card in browser
```

### 5. Checkout

```bash
# Complete purchase (requires --confirm)
ud cart checkout --confirm

# Or get a browser checkout URL
ud cart url
```

If using account credits but the balance is insufficient, pass `--data '{"paymentMethodId":"pm_xxx"}'` to use a card.

## Lease-to-Own (LTO)

Only UD marketplace listings (`ud cart add listed`) support LTO. Check search results for `listingSettings.leaseToOwnOptions`:

```bash
ud cart add listed premium.com --data '{
  "domains": [{
    "name": "premium.com",
    "leaseToOwnOptions": {
      "type": "equal_installments",
      "termLength": 12
    }
  }]
}'
```

- `type`: `equal_installments` or `down_payment_plus_equal_installments`
- `termLength`: 2–120 months (must not exceed `maxTermLength` from search results)
- `downPaymentPercentage`: 10–90% (only for `down_payment_plus_equal_installments`)

## DNS Domain Registration

DNS domains (.com, .org, .net, etc.) require an ICANN contact before checkout. Checkout will fail without one.

```bash
# Check for existing contacts
ud domains contacts list

# Create one if needed (use account email for instant verification)
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

# Then add and checkout
ud cart add registration example.com
ud cart checkout --confirm
```

Contacts created with the user's account email are auto-verified. Otherwise the contact enters `draft` state — wait a few seconds and re-check with `ud domains contacts list`.
