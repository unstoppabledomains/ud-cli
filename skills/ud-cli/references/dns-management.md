# DNS Management

## Prerequisites

DNS record management only works when the domain uses UD default nameservers. Always check first:

```bash
ud domains dns nameservers list example.com
```

If the domain uses custom nameservers, switch back to UD defaults to manage records:

```bash
ud domains dns nameservers set-default --data '{"domains":["example.com"]}'
```

## Listing Records

```bash
ud domains dns records list example.com
ud domains dns records list example.com --format json
```

## Adding Records

### Single Record (shorthand flags)

```bash
# A record
ud domains dns records add example.com --type A --values 1.2.3.4

# CNAME with subdomain
ud domains dns records add example.com --type CNAME --sub-name www --values example.com

# MX record
ud domains dns records add example.com --type MX --values "10 mail.example.com"

# TXT record
ud domains dns records add example.com --type TXT --values "v=spf1 include:_spf.google.com ~all"
```

### Bulk Records (--data)

```bash
ud domains dns records add example.com --data '{
  "records": [
    {"domain": "example.com", "type": "A", "values": ["1.2.3.4"]},
    {"domain": "example.com", "type": "CNAME", "subName": "www", "values": ["example.com"]},
    {"domain": "example.com", "type": "MX", "values": ["10 mail.example.com"]}
  ]
}'
```

### Upsert Modes

If a record already exists, use `--upsert-mode`:

```bash
# Append new values alongside existing ones
ud domains dns records add example.com --type A --values 5.6.7.8 --upsert-mode append

# Replace existing values entirely
ud domains dns records add example.com --type A --values 5.6.7.8 --upsert-mode replace
```

Without `--upsert-mode`, adding a duplicate record type returns a `NO_CHANGE` error.

## Updating Records

Get the record ID from `ud domains dns records list` first:

```bash
ud domains dns records update --data '{
  "records": [{"recordId": "rec_abc123", "values": ["5.6.7.8"]}]
}'
```

## Removing Records

```bash
# Remove specific record by ID
ud domains dns records remove --data '{
  "records": [{"recordId": "rec_abc123"}]
}'

# Remove ALL records (requires --confirm)
ud domains dns records remove-all example.com --confirm
```

## Tracking Changes

DNS changes are asynchronous. Track propagation:

```bash
ud domains operations example.com
```

## Custom Nameservers

```bash
# Set custom nameservers (disables DNS record management)
ud domains dns nameservers set-custom --data '{
  "domains": ["example.com"],
  "nameservers": ["ns1.custom.com", "ns2.custom.com"]
}'

# Reset to UD defaults (re-enables DNS record management)
ud domains dns nameservers set-default --data '{"domains":["example.com"]}'
```

Custom nameservers require 2–12 hostnames. DNSSEC DS records are optional.

## Hosting & Redirects

```bash
# List hosting config
ud domains hosting redirects list example.com

# Add a redirect
ud domains hosting redirects add --data '{
  "records": [{"domain": "example.com", "type": "redirect-301", "target": "https://newsite.com"}]
}'

# Remove redirect
ud domains hosting redirects remove --data '{
  "records": [{"domain": "example.com"}]
}'
```

## AI Landing Pages

```bash
# Generate an AI landing page (async)
ud domains hosting landers generate example.com

# Check status (pending → generating → hosted)
ud domains hosting landers status example.com

# Remove (destructive — deletes content and hosting config)
ud domains hosting landers remove example.com
```
