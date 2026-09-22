# Submitting Lesuto to the xAI Grok Build marketplace

This is the packet for a PR against [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace).

Open listing PR: [xai-org/plugin-marketplace#828](https://github.com/xai-org/plugin-marketplace/pull/828) (Add Lesuto Grok plugin). As of 2026-09-22 the PR is still **open**. Review was requested. It has not merged, so Lesuto is not in `/marketplace` yet. Plugin version **1.6.0** adds **All jobs** (Connect, Content, and Fulfillment on one secret). GraphQL stays queries only; named tools handle writes.

Public source (Grok clones this SHA): https://github.com/lesuto/lesuto-grok-plugin

Plugin file changes in Lesuto-Chameleon publish to that public repo via `.github/workflows/publish-lesuto-grok-plugin.yml` (push to `develop` when `lesuto-grok-plugin/` changes, or Actions → Publish Lesuto Grok Plugin). Local: `./scripts/publish-lesuto-grok-plugin.sh`.

## Catalog entry

Pin `sha` with:

```bash
git ls-remote https://github.com/lesuto/lesuto-grok-plugin.git HEAD
```

```json
{
  "name": "lesuto",
  "description": "Ask Grok how all your stores and companies are doing. Drill into one when you need to.",
  "category": "productivity",
  "source": {
    "source": "url",
    "url": "https://github.com/lesuto/lesuto-grok-plugin.git",
    "sha": "df301b1d57e0ecf6e2cfacff7e2e662e91aa9087"
  },
  "homepage": "https://www.lesuto.com/integrations/grok-agent",
  "keywords": ["lesuto", "lesuto connect", "lesuto hub", "lesuto seller"],
  "domains": ["lesuto.com", "www.lesuto.com", "api.lesuto.com", "hub.lesuto.com"]
}
```

Replace the `sha` with `git ls-remote https://github.com/lesuto/lesuto-grok-plugin.git HEAD` immediately before the xAI PR. Public HEAD when this packet was written: `df301b1d57e0ecf6e2cfacff7e2e662e91aa9087`. Not a branch. Not a tag.

## After forking xai-org/plugin-marketplace

1. Append that object to `.grok-plugin/marketplace.json` `plugins`.
2. `python3 scripts/generate-plugin-index.py`
3. `python3 scripts/validate-catalog.py`
4. `python3 scripts/generate-plugin-index.py --check`
5. Open the PR. Code-owner review is required.

To ship a plugin update later: let the publish workflow (or `scripts/publish-lesuto-grok-plugin.sh`) push the public mirror, then bump the catalog `sha`. If PR 828 is still open, update that PR. After it merges, open a new xAI PR that only changes `sha` and regenerates `.grok-plugin/plugin-index.json`. Do not add a second catalog name.
