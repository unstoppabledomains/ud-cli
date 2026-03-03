# Cart & Checkout

## Cart Operations

```bash
ud cart get                    # View cart contents and pricing
ud cart remove                 # Remove items (use --data for item IDs)
ud cart url                    # Get browser checkout URL
ud cart payment-methods        # List saved cards and account balance
ud cart add-payment-method     # Get URL to add a payment method
```

## Adding to Cart

### Smart Add (Recommended)

`ud cart add` auto-detects the domain source and routes to the correct subcommand:

```bash
ud cart add mybusiness.com mybusiness.io
```

### Explicit Subcommands

```bash
ud cart add registration <domains...>    # Fresh registration
ud cart add listed <domains...>          # UD marketplace listing
ud cart add afternic <domains...>        # Afternic marketplace
ud cart add sedo <domains...>            # Sedo marketplace
ud cart add renewal <domains...>         # Renew owned domains
```

### Options

- `--quantity <years>`: Registration or renewal period (1–10 years, default: 1)
- `--domains-file <path>`: Read domain list from file (one per line)
- Max 50 domains per cart-add call

## ICANN Contact Requirement

DNS domains (.com, .org, .net, etc.) **require an ICANN contact before checkout**. Checkout fails without one.

```bash
# Check for existing contacts
ud domains contacts list

# Create if needed
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
```

Using the account email for the contact enables instant verification. Otherwise, the contact enters `draft` state — wait a few seconds and re-check with `ud domains contacts list`.

## Checkout

```bash
# Requires --confirm
ud cart checkout --confirm
```

- Uses account credits by default
- If balance is insufficient, pass a payment method: `--data '{"paymentMethodId":"pm_xxx"}'`
- `contactId` auto-selects the most recent ICANN contact if omitted
- Cart is cleared after successful checkout

### Browser Checkout

For users who prefer to review and pay in the browser:

```bash
ud cart url
```

## Pricing

All prices are in **cents (USD)**: `5000` = $50.00.

## Renewals

```bash
# Check expiration dates
ud domains list --fields name,expiresAt

# Add renewals (1–10 years per domain)
ud cart add renewal mysite.com --quantity 2
ud cart add renewal mysite.com othersite.com

# Check payment and complete
ud cart payment-methods
ud cart checkout --confirm
```

## Troubleshooting

- **Wrong cart tool**: Check `marketplace.source` from search results. Use smart `ud cart add` to avoid this.
- **Missing ICANN contact**: Create one with `ud domains contacts create` before checkout.
- **Contact in draft**: ID starts with `draft-`. Wait a few seconds and re-check with `ud domains contacts list`.
- **No payment method**: Use `ud cart payment-methods` to verify, or `ud cart add-payment-method` to add one.
- **Insufficient balance**: Pass `paymentMethodId` in checkout `--data`.
