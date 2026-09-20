# Submitting Lesuto to the xAI Grok Build marketplace

This is the packet for a later PR against [xai-org/plugin-marketplace](https://github.com/xai-org/plugin-marketplace). **Do not open that PR until Arron asks.**

Public source (Grok clones this SHA): https://github.com/lesuto/lesuto-grok-plugin

## Catalog entry

Pin `sha` with:

```bash
git ls-remote https://github.com/lesuto/lesuto-grok-plugin.git HEAD
```

```json
{
  "name": "lesuto",
  "description": "Ask Grok how last 30 days looked. Send a Connect invite. Check stock. Same Lesuto channel admin you already run.",
  "category": "productivity",
  "source": {
    "source": "url",
    "url": "https://github.com/lesuto/lesuto-grok-plugin.git",
    "sha": "be223a00bf7fcc1bf7918d74ec08001af0e0bb0c"
  },
  "homepage": "https://www.lesuto.com/integrations/grok-agent",
  "keywords": ["lesuto", "lesuto connect", "lesuto hub", "lesuto seller"],
  "domains": ["lesuto.com", "www.lesuto.com", "api.lesuto.com", "hub.lesuto.com"]
}
```

Replace the `sha` with `git ls-remote https://github.com/lesuto/lesuto-grok-plugin.git HEAD` immediately before the xAI PR. First public commit: `be223a00bf7fcc1bf7918d74ec08001af0e0bb0c`. Not a branch. Not a tag.

## After forking xai-org/plugin-marketplace

1. Append that object to `.grok-plugin/marketplace.json` `plugins`.
2. `python3 scripts/generate-plugin-index.py`
3. `python3 scripts/validate-catalog.py`
4. `python3 scripts/generate-plugin-index.py --check`
5. Open the PR. Code-owner review is required.

To ship a plugin update later: run `scripts/publish-lesuto-grok-plugin.sh` in Lesuto-Chameleon, then bump the `sha` in a new xAI PR. Do not add a second catalog name.
