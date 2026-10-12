# Security

This repository is public. It is the Grok Build plugin source. It must never contain a live Lesuto agent key, channel token, or private key file.

## What the plugin is allowed to do

- Call `https://api.lesuto.com/api/v3/admin/graphql` only (or `https://staging-api.lesuto.com` for Lesuto staging).
- Send `LESUTO_AGENT_KEY` and an optional store hint as request headers. Never put them in the URL, logs, or chat.
- Run GraphQL reads through `lesuto_graphql`. Writes go through named tools. Staff CRM, key minting, refunds, team, billing, and MFA stay blocked. Staff CRM is a separate founder-only connector. Merchant keys cannot call it. Do not put a staff CRM token in this plugin.

## How merchants keep a key safe

1. Mint the key in Command Center or Lesuto Seller (AI Agent Access). Copy it once.
2. Put it only in Grok / MCP secrets as `LESUTO_AGENT_KEY`. Do not paste it into a Grok conversation, a GitHub issue, or this repo.
3. Rotate or revoke it in Command Center if it leaks, if someone leaves, or when the 90-day default expires.

Reads cost 1 integration credit. Writes cost 2. Exhausted credits return HTTP 402.

## Reporting a leak

Revoke the key in Command Center first. Then contact Lesuto from that same account. Do not file the live secret in a public GitHub issue.
