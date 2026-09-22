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
  {
    name: 'hub_create_post',
    description: 'Create a Hub store post. Requires a Content or All jobs key. Pass at least three hashtags. Defaults to the active store.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        body: { type: 'string' },
        imageUrl: { type: 'string' },
        videoUrl: { type: 'string' },
        postType: { type: 'string' },
        promoCode: { type: 'string' },
        storeId: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'hashtags'],
    },
    execute: (args) => {
      const hashtags = Array.isArray(args.hashtags) ? args.hashtags.map(String) : [];
      if (hashtags.length < 3) {
        throw new Error('Hub posts need at least three hashtags.');
      }
      return adminGraphql(
        `mutation CreateStorePost($input: CreateStorePostInput!) { createStorePost(input: $input) { id title createdAt } }`,
        {
          input: {
            title: String(args.title),
            body: args.body || null,
            imageUrl: args.imageUrl || null,
            videoUrl: args.videoUrl || null,
            postType: args.postType || null,
            promoCode: args.promoCode || null,
            storeId: args.storeId || null,
            productIds: Array.isArray(args.productIds) ? args.productIds.map(String) : undefined,
            hashtags,
          },
        },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'hub_update_post',
    description: 'Update a Hub store post by id. Requires a Content or All jobs key. Pass only fields to change. If you send hashtags, send at least three.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        imageUrl: { type: 'string' },
        videoUrl: { type: 'string' },
        postType: { type: 'string' },
        promoCode: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['postId'],
    },
    execute: (args) => {
      const input = {};
      for (const key of ['title', 'body', 'imageUrl', 'videoUrl', 'postType', 'promoCode']) {
        if (args[key] != null) input[key] = args[key];
      }
      if (Array.isArray(args.productIds)) input.productIds = args.productIds.map(String);
      if (Array.isArray(args.hashtags)) {
        if (args.hashtags.length < 3) {
          throw new Error('Hub posts need at least three hashtags.');
        }
        input.hashtags = args.hashtags.map(String);
      }
      return adminGraphql(
        `mutation UpdateStorePost($postId: ID!, $input: UpdateStorePostInput!) { updateStorePost(postId: $postId, input: $input) { id title } }`,
        { postId: String(args.postId), input },
        { allowWrite: true },
      );
    },
  },
];
