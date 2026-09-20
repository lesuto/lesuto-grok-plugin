# Lesuto Grok plugin

<p align="center">
  <img src="assets/lesuto-mark.png" alt="Lesuto chameleon mark" width="120" />
</p>

<p align="center"><strong>Ask Grok how last 30 days looked. Send a Connect invite. Check stock. Same store admin you already run.</strong></p>

This plugin lets [Grok Build](https://x.ai/build) (and Cursor, or any MCP client) work **your** Lesuto merchant or supplier store. It is not a Lesuto staff login.

Repository: [github.com/lesuto/lesuto-grok-plugin](https://github.com/lesuto/lesuto-grok-plugin)

## Who we are

Lesuto Technologies builds social commerce: suppliers list products, merchants sell on [Hub](https://hub.lesuto.com), a website, or WordPress, and Lesuto runs checkout and payouts.

Arron Hyman is Founder and CEO, based in Austin, Texas. The motto is **Let's Succeed Together**. Longer term, the [Lesuto Foundation](https://www.lesuto.com/foundation) is how platform revenue funds training and access in developing countries.

- Site: [www.lesuto.com](https://www.lesuto.com)
- This integration: [www.lesuto.com/integrations/grok-agent](https://www.lesuto.com/integrations/grok-agent)
- Docs: [AI Agent Access](https://docs.lesuto.com/docs/integrations/ai-agent-access)

## What this plugin does

Grok acts as **you** on **one** store. Named tools cover:

- Last 7 / 30 / 90 days and year: revenue, orders, average order value, commission, what sold
- Lesuto Connect: meeting types, invite links, upcoming bookings, complete or no-show
- Catalog search, stock on hand, shipping labels
- Hub store status, site status, posts
- Store blog: draft, update, publish
- `lesuto_graphql` for the rest of the scope you picked

Public guests still book on your Connect page. Grok creates invite links. Pass a guest email only when you asked to send the invite.

## Benefits

- Ask the store instead of clicking through Command Center for last month
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
2. Open **Teams → AI Agent Access** (or Lesuto Seller → **AI Agent Access**).

## Mint the key

1. Create a key. Pick a scope:
   - **Connect**: bookings and invite links
   - **Orders Read**: orders and the sales dashboard
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

`LESUTO_CHANNEL_TOKEN` is the same token Seller uses for that store. `LESUTO_API_URL` is optional. When set, it must be `https://api.lesuto.com` (or `https://staging-api.lesuto.com` for Lesuto staging).

## First prompts

- How did last 30 days look, and what sold?
- List my meeting types. Send a Connect invite.
- Search the catalog for this SKU and check stock.
- What is in the last 20 orders, and where are they in fulfillment?

Skills in `skills/` (`lesuto-connect`, `lesuto-catalog`, `lesuto-orders`, `lesuto-analytics`) tell the agent which tool to start with.

## Cursor (same key)

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

## How a professional uses it

Store the key in Grok or Cursor plugin settings. Rotate when someone leaves. Revoke in Command Center if a key leaks.

Reads cost **1** integration credit. Writes cost **2**. Exhausted credits return HTTP 402. Gateway rate limits per key: **60**/minute, **600**/hour, writes also **20**/minute.

Network: this process only calls `https://api.lesuto.com/api/v3/admin/graphql` (stdio MCP, no install scripts, no remote shell). Destructive GraphQL and cancel/complete/no-show tools require `confirm: true`.

License: MIT. Copyright Lesuto Technologies.
