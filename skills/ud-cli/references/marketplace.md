# Marketplace

## Listing Domains for Sale

```bash
# List a domain with a price
ud marketplace listings create mydomain.com --price 99.99

# Bulk listing with --data
ud marketplace listings create mydomain.com otherdomain.com --price 50.00

# Update listing price
ud marketplace listings update --price 75.00 --data '{
  "listings": [{"listingId": "l123"}]
}'

# Cancel listings (requires --confirm)
ud marketplace listings cancel --confirm --data '{
  "listingIds": ["l123"]
}'
```

### Listing Options

Prices are specified in dollars via `--price` (converted to cents automatically). For advanced settings, use `--data`:

```bash
ud marketplace listings create mydomain.com --data '{
  "domains": [{
    "name": "mydomain.com",
    "priceInCents": 9999,
    "acceptOffers": true,
    "validityInDays": 365
  }]
}'
```

## Offers

```bash
# List incoming offers
ud marketplace offers list

# Filter by status
ud marketplace offers list --data '{"status": "pending"}'

# Accept an offer
ud marketplace offers respond --data '{
  "offers": [{"offerId": "o123", "action": "accept"}]
}'

# Reject an offer
ud marketplace offers respond --data '{
  "offers": [{"offerId": "o123", "action": "reject"}]
}'
```

## Domain Conversations (Leads)

Leads are buyer-seller conversations about domains.

```bash
# List all conversation leads
ud marketplace leads list

# Get or create a conversation for a domain
ud marketplace leads get mydomain.com

# List messages in a conversation
ud marketplace leads messages --conversation-id 42

# Send a message
ud marketplace leads send --conversation-id 42 --content "Thanks for your interest!"
```

### When to Use Leads

- When a domain is `registered-listed-for-offers`, direct users to the `purchaseUrl` or use leads to contact the seller.
- When a domain is `registered-not-for-sale` and `listingSettings.contactSellerEnabled` is true, use `ud marketplace leads get <domain>` to contact the owner.

## Workflow: List → Sell

```bash
# 1. Verify ownership
ud domains list --fields name

# 2. Create listing
ud marketplace listings create mydomain.com --price 99.99

# 3. Monitor offers
ud marketplace offers list

# 4. Respond to offers
ud marketplace offers respond --data '{
  "offers": [{"offerId": "o123", "action": "accept"}]
}'
```

## Workflow: Browse → Buy via Marketplace

```bash
# 1. Search for listed domains
ud search premium-name --format json

# 2. Check marketplace.source and marketplace.status

# 3. Add to cart (use smart add)
ud cart add premium-name.com

# 4. Checkout
ud cart get
ud cart checkout --confirm
```
