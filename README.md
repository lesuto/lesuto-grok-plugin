# Lesuto Grok plugin

<p align="center">
  <img src="assets/lesuto-mark.png" alt="Lesuto chameleon mark" width="120" />
</p>

<p align="center"><strong>Ask how all your stores are doing. Drill into one when you need to.</strong></p>

This plugin lets [Grok Build](https://x.ai/build) (and Cursor, Claude Desktop, ChatGPT actions, or any MCP or HTTP client) work **your** Lesuto merchant and supplier stores. It is not a Lesuto staff login.

Repository: [github.com/lesuto/lesuto-grok-plugin](https://github.com/lesuto/lesuto-grok-plugin)

## Who we are

Lesuto Technologies builds social commerce: suppliers list products, merchants sell on [Hub](https://hub.lesuto.com), a website, or WordPress, and Lesuto runs checkout and payouts.

Arron Hyman is Founder and CEO, based in Austin, Texas. The motto is **Let's Succeed Together**. Longer term, the [Lesuto Foundation](https://www.lesuto.com/foundation) is how platform revenue funds training and access in developing countries.

- Site: [www.lesuto.com](https://www.lesuto.com)
- This integration: [www.lesuto.com/integrations/grok-agent](https://www.lesuto.com/integrations/grok-agent)
- Docs: [AI Agent Access](https://docs.lesuto.com/docs/integrations/ai-agent-access)

## What this plugin does

Grok acts as **you** on the stores that key covers. Start with the big picture, then drill in:

- `account_overview`: revenue, orders, average order value, payouts, growth per store, leftover credits. No store switch needed.
- `list_organizations` and `org_overview`: company umbrellas, then revenue and orders for one company
- Last 7 / 30 / 90 days and year on one store: revenue, orders, average order value, commission, what sold
- Lesuto Connect: meeting types, invite links, upcoming bookings, complete or no-show
- Catalog search, stock on hand, shipping labels
- Hub store status, site status, posts
- Store blog: draft, update, publish
- `list_stores` and `use_store` when you want one merchant or supplier store (L1, L2, or the store name)
- `lesuto_graphql` for the rest of the scope you picked

Public guests still book on your Connect page. Grok creates invite links. Pass a guest email only when you asked to send the invite.

## Three key tiers

Mint from Command Center or Lesuto Seller:

| Tier | What it covers | New stores |
|---|---|---|
| Channel | The stores you tick. Frozen at mint time | Rotate to add |
| Organization | Every store in one company, if you also have Agent Access there | Appear automatically |
| Everything | Every store you have Agent Access on, across companies | Appear automatically |

Details: [AI Agent Access docs](https://docs.lesuto.com/docs/integrations/ai-agent-access).

## Benefits

- Ask how the whole account did, then open the store that needs attention
- Send a Connect invite after a consult
- Confirm the SKU and stock before you patch a listing
- Read recent orders and tracking
- Rotate or revoke the key from Command Center when someone leaves

## Create a Lesuto account

1. Sign up at [www.lesuto.com/signup](https://www.lesuto.com/signup) as a **merchant** or **supplier**.
2. Open **Command Center** or the **Lesuto Seller** app. Hub shopper login is the wrong account.
3. Finish store setup so you have a live business account (a channel token such as `merchant_your-slug_admin`).

## Turn on AI Agent Access

1. Command Center → **Integrations** → activate **AI Agent Access**.
2. Open **Teams → AI Agent Access** (or Organizations → AI Agent Access, or Lesuto Seller → **AI Agent Access**).

## Mint the key

1. Create a key. Pick a tier: this store, one organization, or everything you manage. Then pick a ceiling scope, and a scope per store if you are on the channel tier:
   - **Connect**: bookings and invite links
   - **Orders Read**: orders and the sales dashboard, including account overview
   - **Catalog Read**: products and stock
   - **Full**: the same admin work you already do on that store, including ads
2. Default expiry is 90 days (max 365).
3. Click **Copy MCP env** once. The secret is shown at create time. If you lose it, rotate.

## Install in Grok Build

You need Node.js 20 or newer.

**From GitHub (works before the xAI catalog merge):**

```bash
grok plugin install lesuto/lesuto-grok-plugin --trust
```

Or clone [lesuto/lesuto-grok-plugin](https://github.com/lesuto/lesuto-grok-plugin) and add a local plugin that runs:

```bash
node ${GROK_PLUGIN_ROOT}/server.mjs
```

**After xAI lists Lesuto:** Grok Build → `/marketplace` → install **lesuto**.

## Secrets (never chat)

Put these in Grok plugin / MCP secrets. Do not paste the key into a Grok conversation.

```
LESUTO_API_URL=https://api.lesuto.com
LESUTO_AGENT_KEY=lsk_live_…
LESUTO_CHANNEL_TOKEN=merchant_your-slug_admin
```

`LESUTO_CHANNEL_TOKEN` is the same token Seller uses for that store. It is optional when the key covers more than one store: call `account_overview` first, then `use_store` with `L1` or the store name when you need one store. `LESUTO_API_URL` is optional. When set, it must be `https://api.lesuto.com` (or `https://staging-api.lesuto.com` for Lesuto staging).

## First prompts

- How did my company do last month across every brand?
- Give me the big picture across all my stores.
- How did last 30 days look, and what sold?
- List my meeting types. Send a Connect invite.
- Search the catalog for this SKU and check stock.
- What is in the last 20 orders, and where are they in fulfillment?

Skills in `skills/` (`lesuto-connect`, `lesuto-catalog`, `lesuto-orders`, `lesuto-analytics`, `lesuto-organizations`) tell the agent which tool to start with.

## Cursor, Claude, ChatGPT, and scripts (same key)

The key is the product. Grok's MCP plugin is the featured wrapper. Cursor, Claude Desktop, ChatGPT actions, and a `curl` call all send the same headers to `https://api.lesuto.com/api/v3/admin/graphql`.

```json
{
  "mcpServers": {
    "lesuto": {
      "command": "node",
      "args": ["/absolute/path/to/lesuto-grok-plugin/server.mjs"],
      "env": {
        "LESUTO_API_URL": "https://api.lesuto.com",
        "LESUTO_AGENT_KEY": "lsk_live_YOUR_KEY",
        "LESUTO_CHANNEL_TOKEN": "YOUR_CHANNEL_TOKEN"
      }
    }
  }
}
```

Raw GraphQL (no MCP): `POST https://api.lesuto.com/api/v3/admin/graphql` with your agent key. Ask `agentAccountOverview(period: "30d")` for the rollup. Full example: [AI Agent Access docs](https://docs.lesuto.com/docs/integrations/ai-agent-access).

## How a professional uses it

Store the key in Grok or Cursor plugin settings. Rotate when someone leaves. Revoke in Command Center if a key leaks.

Reads cost **1** integration credit. Writes cost **2**. `account_overview` is one read, no matter how many stores sit on the key. Exhausted credits return HTTP 402. Gateway rate limits per key: **60**/minute, **600**/hour, writes also **20**/minute.

Network: this process only calls `https://api.lesuto.com/api/v3/admin/graphql` (stdio MCP, no install scripts, no remote shell). Destructive GraphQL and cancel/complete/no-show tools require `confirm: true`.

## Tests

From this directory, with Node.js 20 or newer. No network and no live keys:

```bash
npm test
```

License: MIT. Copyright Lesuto Technologies.
