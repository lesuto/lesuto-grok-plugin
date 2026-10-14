import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const SITES_OPERATOR_GUIDE = `You install the storefront on a host the merchant already owns. Lesuto does not log into that host from our servers.

Workflow:
1. list_site_logins for host and username only. Secrets never appear here.
2. suggest_site_install with the live URL. WordPress: plugin plus Site Key from list_deployments. Any other host: Commerce SDK snippet. Unknown provider: say so and offer SDK. No Shopify or Wix app.
3. unwrap_site_login with confirm true only when you are on that host login form. Type the secret there. Do not print it in chat. Do not log it. One-shot. Max 5 unwraps per hour.
4. Operator Chrome seat is a separate locked administrator. Never log into Command Center as the merchant. Never call adminLogin.

Site Key stays on Deployments. The vault is the foreign host login only.`;

export const sitesTools = [
  {
    name: 'sites_operator_guide',
    description: 'How to pick WordPress plugin vs Commerce SDK and unwrap a bot host login. Never print the secret in chat.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => SITES_OPERATOR_GUIDE,
  },
  {
    name: 'list_site_logins',
    description: 'List saved host logins for this store. Returns host, username, provider. Never the secret.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListSiteLogins {
        listSiteLogins { id label host provider username deploymentId lastUsedAt revokedAt unwrappedAt }
      }`,
    ),
  },
  {
    name: 'suggest_site_install',
    description: 'Recommend WordPress plugin plus Site Key, or Commerce SDK snippet, from a live https URL. Does not fetch the host.',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string' },
      },
      required: ['url'],
    },
    execute: (args) => adminGraphql(
      `query SuggestSiteInstall($url: String!) {
        suggestSiteInstall(url: $url) { provider playbook }
      }`,
      { url: String(args.url || '') },
    ),
  },
  {
    name: 'unwrap_site_login',
    description: 'One-shot unwrap of a bot host login for the login form only. Do not print the secret in chat. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['id'],
    },
    execute: (args) => {
      requireConfirm(args, 'site login unwrap');
      return adminGraphql(
        `mutation UnwrapSiteLogin($id: ID!, $confirm: Boolean!) {
          unwrapSiteLogin(id: $id, confirm: $confirm) { host username secret }
        }`,
        { id: String(args.id), confirm: true },
        { allowWrite: true },
      );
    },
  },
];
