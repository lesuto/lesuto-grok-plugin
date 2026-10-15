import { adminGraphql } from '../lib/graphql.mjs';
import { isGraphqlSchemaMismatch } from '../lib/scene-field-tiers.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const SITES_OPERATOR_GUIDE = `You install the storefront on a host the merchant already owns. Lesuto does not log into that host from our servers.

Workflow:
1. list_site_logins for host, loginUrl, and username only. You only see logins tagged to this key. Secrets never appear here.
2. Open loginUrl in the browser. That is the page where this username and password are typed. WordPress is usually /wp-admin. Webflow and Squarespace logins are often on their own site, not the storefront. If loginUrl is missing, find the login form on host first.
3. suggest_site_install with the live URL. WordPress: plugin plus Site Key from list_deployments. Any other host: Commerce SDK snippet. Unknown provider: say so and offer SDK. No Shopify or Wix app.
4. unwrap_site_login with confirm true only when you are on that login page. Type the secret there. Do not print it in chat. Do not log it. One-shot. Max 5 unwraps per hour.
5. Operator Chrome seat is a separate locked administrator. Never log into Command Center as the merchant. Never call adminLogin.

Site Key stays on Deployments. The vault is the foreign host login only.`;

async function graphqlWithLoginUrl(query, variables, opts) {
  try {
    return await adminGraphql(query, variables, opts);
  } catch (err) {
    if (!isGraphqlSchemaMismatch(err) || !/\bloginUrl\b/.test(query)) throw err;
    return adminGraphql(String(query).replace(/\bloginUrl\b/g, ''), variables, opts);
  }
}

export const sitesTools = [
  {
    name: 'sites_operator_guide',
    description: 'How to pick WordPress plugin vs Commerce SDK and unwrap a bot host login. Never print the secret in chat.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => SITES_OPERATOR_GUIDE,
  },
  {
    name: 'list_site_logins',
    description: 'List host logins tagged to this key. Returns host, loginUrl, username, provider. Never the secret.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => graphqlWithLoginUrl(
      `query ListSiteLogins {
        listSiteLogins { id label host loginUrl provider username deploymentId lastUsedAt revokedAt unwrappedAt }
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
    description: 'One-shot unwrap of a bot host login for the login page only. Do not print the secret in chat. Requires confirm true.',
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
      return graphqlWithLoginUrl(
        `mutation UnwrapSiteLogin($id: ID!, $confirm: Boolean!) {
          unwrapSiteLogin(id: $id, confirm: $confirm) { host loginUrl username secret }
        }`,
        { id: String(args.id), confirm: true },
        { allowWrite: true },
      );
    },
  },
];
