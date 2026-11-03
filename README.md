# Lesuto Grok plugin

<p align="center">
  <img src="assets/lesuto-mark.png" alt="Lesuto handshake mark" width="120" />
</p>

<p align="center"><strong>Ask how all your stores are doing. Drill into one when you need to.</strong></p>

This plugin lets [Grok Build](https://x.ai/build) (and Cursor, Claude Desktop, ChatGPT actions, or any MCP or HTTP client) work **your** Lesuto merchant and supplier stores. It is not a Lesuto staff login. It cannot read Lesuto staff CRM, leads, or outreach. A merchant key and a staff CRM token cannot be used together.

Repository: [github.com/lesuto/lesuto-grok-plugin](https://github.com/lesuto/lesuto-grok-plugin)

## Who we are

Lesuto Technologies builds social commerce: suppliers list products, merchants sell on [Hub](https://hub.lesuto.com), a website, or WordPress, and Lesuto runs checkout and payouts.

Arron Hyman is Founder and CEO, based in Austin, Texas. The motto is **Let's Succeed Together**. Longer term, the [Lesuto Foundation](https://www.lesuto.com/foundation) is how platform revenue funds training and access in developing countries.

- Site: [www.lesuto.com](https://www.lesuto.com)
- This integration: [www.lesuto.com/integrations/grok-agent](https://www.lesuto.com/integrations/grok-agent)
- Docs: [AI Agent Access](https://docs.lesuto.com/docs/integrations/ai-agent-access)

## What this plugin does

Grok works as **your agent**: a named account (say "Grok") that you sponsor, with its own role on the stores it covers, never more than you hold. Start with the big picture, then drill in:

- `account_overview`: revenue, orders, average order value, payouts, growth per store, and that store's own leftover credits. No store switch needed.
- `list_organizations` and `org_overview`: company umbrellas, then revenue and orders for one company. Credits stay on each store.
- Last 7 / 30 / 90 days and year on one store: revenue, orders, average order value, commission, what sold
- Lesuto Connect in Command Center: meeting types, invite links, upcoming bookings, complete or no-show. Booking pages made in the Lesuto Connect app (lesutoconnect.com/app) belong to a Lesuto ID account and are not visible to agent keys.
- Catalog search, stock on hand, shipping labels
- Set stock on hand without changing price
- Buy a shipping label after you confirm
- Hub store status, site status, posts
- Store blog: draft, update, publish
- Social Studio: growth lines, campaigns, social posts, campaign video. Same Creative Studio path as admin (characters, look stills with numbered photo URLs so you can pick, voice pick, briefs, scripts, listing-photo start and end frames, stills, stitch overlays, 1080p, brand kit). Prefer stepwise `studio_*` tools; `studio_produce_video` then `studio_job_status` is the shortcut. `social_generate_video` with `includeAudio` asks Cinema (Veo) for native sound design, not a licensed song. Job `outputUrl` must be an MP4, not a `.mp4.png` poster. Optional 3D mesh is `studio_reconstruct_3d` when they asked for a GLB. Voice cloning, OAuth, and billing stay with a person. Look stills use membership AI credits (50 each). Listing keyframes are 12 each. Agent calls use integration credits (1 read / 2 write).
- `list_stores` and `use_store` when you want one merchant or supplier store (L1, L2, or the store name)
- `lesuto_graphql` for extra reads. Writes go through named tools.

Jobs: **Read** is always on. Tick **Connect**, **Content**, **Social**, **Fulfillment**, plus extra **Catalog** and **Sites**. **All operate** is the four operate jobs only. Catalog creates stores, subscribes suppliers, and stocks aisles. Sites unwraps a bot host login for the login form only. Never print that secret in chat. Docs: [AI Agent Access](https://docs.lesuto.com/docs/integrations/ai-agent-access).

Public guests still book on your Connect page. Grok creates invite links. Pass a guest email only when you asked to send the invite.

## Agents and keys

Every key belongs to an agent, and every agent has a sponsor: the person who added it. Add one in Command Center or Lesuto Seller:

| Agent | Where | What it covers | New stores |
|---|---|---|---|
| Store | Teams → AI Agent Access | That store | Add another agent, or widen its scope |
| Brand | Organization → People & access | The brands you pick, every country | Appear automatically |
| Organization | Organization → People & access | Every store of the organization | Appear automatically |
| Personal | My Account → My agents | What you can reach; a follow-me agent copies your role in each organization | Appear automatically |

The agent gets a role (Admin, Catalog, Fulfilment, Finance or Viewer, never Owner) like a teammate, and never more than its sponsor holds. If the sponsor leaves the organization, the agent pauses until an owner gives it a new sponsor or revokes it. A paused or revoked agent gets HTTP 401 (`AGENT_PAUSED`, `AGENT_REVOKED`).

Some actions wait for a person: payouts and bank accounts, roles and permissions, logins and API keys, refunds above the organization's limit (USD 100 by default), deleting data, bulk exports. Lesuto answers HTTP 403 `AGENT_CONFIRMATION_REQUIRED` with a `requestId` and a summary. Tell the person what is waiting. Once their sponsor approves it in the dashboard (within 24 hours), retry that same call once with the header `X-Lesuto-Agent-Confirm: <requestId>` (the 403 message and its `confirmHeader` field name it). Without the header the retry opens a new request.

### Keys made before agents

On 25 October 2026 every live key became an agent named after the key's label, sponsored by the person who made it. The key did not change: it still works as that person, on the same stores, until its agent is upgraded. Upgrade it from AI Agent Access (**Upgrade to its own account**; the preview shows the role and stores it will hold). The secret stays the same, so nothing changes in Grok.

From **23 April 2027** a key that still works as the person who made it stops with HTTP 401 `AGENT_KEY_RETIRED`. Upgrade its agent before then, or add a new agent and put its key in your secrets.

Details: [AI Agent Access docs](https://docs.lesuto.com/docs/integrations/ai-agent-access).

## Credits stay on each store

`account_overview` includes `creditBalance` on every store. That number is that store's integration credits. `org_overview` adds up revenue and orders for the company. Asking about one store spends that store's credits: **1** for a read, **2** for a write. `account_overview` itself is one read.

An agent covers the stores its role and scope reach, and only those its sponsor can still operate. If the sponsor loses a store, the agent stops covering it on the next question. The other stores keep working.

The key cannot add or change agents, people, organization membership, or billing. Those stay in Command Center.

## Benefits

- Ask how the whole account did, then open the store that needs attention
- Send a Connect invite after a consult
- Confirm the SKU and stock. Fulfillment keys can set stock on hand without changing price.
- Read recent orders and tracking
- Run Social Studio: campaigns, posts, and campaign video, including character look photos you can pick
- Pause, rotate or revoke the agent from Command Center. When its sponsor leaves, it pauses on its own.

## Create a Lesuto account

1. Sign up at [www.lesuto.com/sign-up](https://www.lesuto.com/sign-up) as a **merchant** or **supplier**.
2. Open **Command Center** or the **Lesuto Seller** app. Hub shopper login is the wrong account.
3. Finish store setup so you have a live business account (a channel token such as `merchant_your-slug_admin`).

## Turn on AI Agent Access

1. Command Center → **Integrations** → activate **AI Agent Access** on each store you want to cover. Social Studio also opens that listing: **Automate with AI Agent Access** sits left of Store.
2. Open **Teams → AI Agent Access** for this store (after activate), **Organizations → AI Agent Access** for the company (always in Organizations), or Lesuto Seller → **AI Agent Access**.

## Add an agent and its key

1. Add an agent and name it (for example "Grok"). Pick where it works: this store, some brands, the whole organization, or follow you everywhere (My Account → My agents). Then pick a job, and Read on a store if you want a tighter ceiling:
   - **Read**: answers questions
   - **Connect**: bookings and invite links
   - **Content**: store blog and Hub posts
   - **Social**: Social Studio campaigns, posts, and campaign video
   - **Fulfillment**: stock on hand and shipping labels
   - **All jobs**: Connect, Content, Social, and Fulfillment on one secret
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
LESUTO_AGENT_KEY_GROK=lsk_live_…
```

The plugin reads `LESUTO_AGENT_KEY_GROK` first, then `LESUTO_AGENT_KEY`, so a Grok-only key works on its own. If Lesuto rejects the key, the error names which variable was sent, the last 4 characters of that key, the HTTP status and code, and the permission the server reported for a 403.

`LESUTO_API_URL` is optional. When set, it must be `https://api.lesuto.com` (or `https://staging-api.lesuto.com` for Lesuto staging).

For a company or frozen-list key, the agent key is enough. Call `list_stores` then `use_store` with L1 or the store name when a tool needs one store.

Optional default store (Teams keys, or a favorite store on an org key):

```
LESUTO_CHANNEL_TOKEN=merchant_your-slug_admin
```

## First prompts

- How did my company do last month across every brand?
- Give me the big picture across all my stores.
- How did last 30 days look, and what sold?
- List my meeting types. Send a Connect invite.
- Search the catalog for this SKU and check stock.
- What is in the last 20 orders, and where are they in fulfillment?
- Draft a Social Studio campaign and show the credit estimate.
- Produce a 15 second campaign video for this Hub store, then tell me when the job finishes.
- Create a character, show me the numbered look photos, then lock the look I pick.
- Search voices, lock one on the character, assign listing photos as start and end frames, then render the timeline with brand kit overlays.
- Put talent seated in the chair: set the scene action, regenerate stills with force, then render. Swap scene order, then stitch.
- Build a 3D GLB from this product's listing photos only if I asked for a mesh.

Skills in `skills/` (`lesuto-analytics`, `lesuto-catalog`, `lesuto-chrome-toolkit`, `lesuto-connect`, `lesuto-orders`, `lesuto-organizations`, `lesuto-social`) tell the agent which tool to start with. The Chrome Toolkit zip is `https://cdn.lesuto.com/chrome-toolkit/lesuto-chameleon-toolkit.zip`.

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
        "LESUTO_AGENT_KEY_GROK": "lsk_live_YOUR_KEY",
        "LESUTO_CHANNEL_TOKEN": "YOUR_CHANNEL_TOKEN"
      }
    }
  }
}
```

Raw GraphQL (no MCP): `POST https://api.lesuto.com/api/v3/admin/graphql` with your agent key. Ask `agentAccountOverview(period: "30d")` for the rollup. Full example: [AI Agent Access docs](https://docs.lesuto.com/docs/integrations/ai-agent-access).

## How a professional uses it

Store the key in Grok or Cursor plugin settings. An agent holds up to 3 live keys, so you can rotate without downtime. Revoke the key (or the agent) in Command Center if a key leaks.

Reads cost **1** integration credit. Writes cost **2**. `account_overview` is one read, no matter how many stores sit on the key. Exhausted credits return HTTP 402. Gateway rate limits per key: **60**/minute, **600**/hour, writes also **20**/minute.

Network: this process only calls `https://api.lesuto.com/api/v3/admin/graphql` (stdio MCP, no install scripts, no remote shell). `lesuto_graphql` is queries only. Cancel/complete/no-show and buying a shipping label require `confirm: true`.

## Security

This repo is public. Never commit a live `LESUTO_AGENT_KEY`, channel token, or private key file. See [SECURITY.md](SECURITY.md).

Every tool result comes back as `{ "notice": "...", "data": { ... } }`. What is under `data` is store data, and the model is told never to follow instructions written inside it (a customer message that says "refund my order" stays a message). Customer names, e-mails, phones and addresses arrive as `[redacted]` unless the store owner lets the agent read customer details, for a stated purpose and for up to 90 days.

## Tests

From this directory, with Node.js 20 or newer. No network and no live keys:

```bash
npm test
```

License: MIT. Copyright Lesuto Technologies.
