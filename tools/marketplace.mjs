import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const MARKETPLACE_OPERATOR_GUIDE = `You operate Lesuto Marketplace as this merchant. Catalog lives on the channel. A store is a deployment. Channel-only subscribe does not copy products into a store.

Workflow:
1. Call list_subscriptions and list_deployments before changing sourcing.
2. Subscribe with subscribe_to_supplier. Default storeRoutingMode is channel_only. Use selected plus deploymentIds only when the merchant named stores. Sync All copies the catalog. Manual (selective) creates the relationship without copying.
3. list_channel_domains shows verification (Active is Secure) and WordPress vs Commerce SDK usages. Site Key is Deployments, Copy Key, not Store, Commerce SDK.
4. What to Sell on a deployment is which collections that storefront shows. Channel catalog and store catalog are different.
5. Never unsubscribe, never wipe collections, never invent a supplierSubscriptions field. Use mySubscriptions. There is no supplierSubscriptions query.
6. lesuto_graphql is read-only. Use these named tools for subscribe and catalog reads.

Credits: subscribe may copy a large catalog. Confirm true is required.`;

export const marketplaceTools = [
  {
    name: 'marketplace_operator_guide',
    description: 'How to subscribe, route products to stores, and read Site Key / domain verification for this merchant.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => MARKETPLACE_OPERATOR_GUIDE,
  },
  {
    name: 'list_subscriptions',
    description: 'List this merchant channel subscriptions (mySubscriptions). Includes status, sync mode, and store routing.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListSubscriptions {
        mySubscriptions {
          id supplierChannelId status subscriptionType syncMode storeRoutingMode targetDeploymentIds productCount
          supplierProfile { nameCompany marketSpecialty commission }
        }
      }`,
    ),
  },
  {
    name: 'subscribe_to_supplier',
    description: 'Subscribe this merchant to a supplier. storeRoutingMode defaults to channel_only. subscriptionType selective does not copy the catalog. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        supplierChannelId: { type: 'string' },
        subscriptionType: { type: 'string', description: 'all or selective' },
        syncMode: { type: 'string', description: 'all or in-stock' },
        storeRoutingMode: { type: 'string', description: 'channel_only, selected, or all' },
        targetDeploymentIds: { type: 'array', items: { type: 'string' } },
        confirm: { type: 'boolean' },
      },
      required: ['supplierChannelId'],
    },
    execute: (args) => {
      requireConfirm(args, 'supplier subscription');
      const subscriptionType = String(args.subscriptionType || 'selective') === 'all' ? 'all' : 'selective';
      const syncMode = String(args.syncMode || 'all') === 'in-stock' ? 'in-stock' : 'all';
      const storeRoutingMode = ['selected', 'all'].includes(String(args.storeRoutingMode || ''))
        ? String(args.storeRoutingMode)
        : 'channel_only';
      const targetDeploymentIds = Array.isArray(args.targetDeploymentIds)
        ? args.targetDeploymentIds.map(String)
        : [];
      return adminGraphql(
        `mutation SubscribeToSupplier($supplierChannelId: ID!, $syncMode: String, $subscriptionType: String, $storeRoutingMode: String, $targetDeploymentIds: [ID!]) {
          subscribeToSupplier(supplierChannelId: $supplierChannelId, syncMode: $syncMode, subscriptionType: $subscriptionType, storeRoutingMode: $storeRoutingMode, targetDeploymentIds: $targetDeploymentIds)
        }`,
        {
          supplierChannelId: String(args.supplierChannelId),
          syncMode,
          subscriptionType,
          storeRoutingMode,
          targetDeploymentIds: storeRoutingMode === 'selected' ? targetDeploymentIds : null,
        },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'list_deployments',
    description: 'List this channel stores (deployments) with Site Key and product counts. Copy Key lives here, not Store, Commerce SDK.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListDeployments {
        deploymentsWithProductCounts { id name siteKey productCount hubStoreId autoSyncAllChannelProducts }
      }`,
    ),
  },
  {
    name: 'list_channel_domains',
    description: 'List registered domains, verification status, and usages (WordPress, Commerce SDK, email).',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListChannelDomains {
        getChannelDomains { id domain status usages emailStatus }
      }`,
    ),
  },
];
