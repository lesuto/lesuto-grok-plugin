import { adminGraphql } from '../lib/graphql.mjs';

export const hubTools = [
  {
    name: 'store_status',
    description: 'Read who is authenticated and channel profile status.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query StoreStatus { me { id identifier } merchantProfile { id nameCompany } supplierProfile { id nameCompany } }`,
    ),
  },
  {
    name: 'site_status',
    description: 'Read published deployments for this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query SiteStatus { deploymentConfigs { id name platform siteKey enabled createdAt } }`,
    ),
  },
  {
    name: 'hub_posts',
    description: 'List Hub store posts. channelId 0 means the active channel.',
    inputSchema: {
      type: 'object',
      properties: { take: { type: 'number' }, skip: { type: 'number' } },
    },
    execute: (args) => adminGraphql(
      `query HubPosts($take: Int, $skip: Int) { storePosts(channelId: "0", take: $take, skip: $skip) { id title createdAt } }`,
      { take: Math.min(Number(args.take) || 20, 50), skip: Number(args.skip) || 0 },
    ),
  },
];
