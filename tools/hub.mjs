import { adminGraphql } from '../lib/graphql.mjs';
import { graphqlWithHubPermalinkFallback } from '../lib/hub-permalink-tiers.mjs';

function hubGraphql(query, variables, opts) {
  return graphqlWithHubPermalinkFallback(adminGraphql, query, variables, opts);
}

/** An https URL (trimmed), or a clear error naming the field; the server checks the same. */
export function httpsUrl(value, field, { optional = false, allowHttp = false } = {}) {
  const url = String(value ?? '').trim();
  if (!url) {
    if (optional) return null;
    throw new Error(`${field} is required.`);
  }
  if (!(allowHttp ? /^https?:\/\/\S+$/i : /^https:\/\/\S+$/i).test(url)) {
    throw new Error(`${field} must be ${allowHttp ? 'an http or https' : 'an https'} URL.`);
  }
  return url;
}

/**
 * The publish request for a finished MP4: no server render (the clip is already exported, as
 * when the Seller app publishes a device-exported scene), and no agreement version (the agent
 * key carries its owner's acceptance). Until 2026-11-02 the tool sent neither field and every
 * call was refused.
 */
export function scenePublishInput(args) {
  const videoUrl = String(args?.videoUrl || '').trim();
  const duration = Math.round(Number(args?.duration));
  if (!/^https:\/\//.test(videoUrl) || /\.mp4\.png$/i.test(videoUrl)) throw new Error('videoUrl must be the https URL of a finished MP4, not a poster image.');
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('duration must be the clip length in seconds.');
  const list = (value) => (Array.isArray(value) ? value.map((v) => String(v).trim()).filter(Boolean) : []);
  const input = {
    videoUrl,
    duration,
    title: args.title ? String(args.title) : null,
    caption: args.caption ? String(args.caption) : null,
    thumbnailUrl: args.thumbnailUrl ? String(args.thumbnailUrl) : null,
    publishJob: { needsServerRender: false },
  };
  const hashtags = list(args.hashtags);
  const productIds = list(args.productIds);
  if (hashtags.length) input.hashtags = hashtags;
  if (productIds.length) input.productIds = productIds;
  if (args.storeId) input.storeId = String(args.storeId);
  return input;
}

export const hubTools = [
  {
    name: 'store_status',
    description: 'Read who is authenticated and channel profile status.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query StoreStatus { me { id identifier } merchantProfile { id nameCompany } }`,
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
    description: 'List Hub store posts. hubPermalink is the public share URL (https://hub.lesuto.com/post/{id} or the tenant Hub origin). channelId 0 means the active channel.',
    inputSchema: {
      type: 'object',
      properties: { take: { type: 'number' }, skip: { type: 'number' } },
    },
    execute: (args) => hubGraphql(
      `query HubPosts($take: Int, $skip: Int) { storePosts(channelId: "0", take: $take, skip: $skip) { id title createdAt hubPermalink } }`,
      { take: Math.min(Number(args.take) || 20, 50), skip: Number(args.skip) || 0 },
    ),
  },
  {
    name: 'hub_create_post',
    description: 'Create a Hub store post. Returns hubPermalink, the public share URL. Requires a Content or All jobs key. Pass at least three hashtags. Defaults to the active store. Show hubPermalink to the merchant after create.',
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
      return hubGraphql(
        `mutation CreateStorePost($input: CreateStorePostInput!) { createStorePost(input: $input) { id title createdAt hubPermalink } }`,
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
    name: 'hub_create_scene',
    description: 'Create a shoppable Hub scene (reel) from a hosted MP4. Requires a Content or All jobs key. The key owner must have accepted the content-rights agreement. Pass duration in seconds and the productIds shown in the scene. Hub is not Social Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        videoUrl: { type: 'string' },
        duration: { type: 'number', description: 'Video length in seconds' },
        thumbnailUrl: { type: 'string' },
        caption: { type: 'string' },
        storeId: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        hashtags: { type: 'array', items: { type: 'string' } },
      },
      required: ['title', 'videoUrl', 'duration'],
    },
    execute: (args) => {
      const duration = Math.round(Number(args.duration));
      if (!Number.isFinite(duration) || duration < 1) {
        throw new Error('Pass duration: the video length in whole seconds.');
      }
      return hubGraphql(
        `mutation CreateScene($input: CreateSceneInput!) { createScene(input: $input) { id title hubPermalink } }`,
        {
          input: {
            title: String(args.title),
            videoUrl: httpsUrl(args.videoUrl, 'videoUrl'),
            duration,
            thumbnailUrl: httpsUrl(args.thumbnailUrl, 'thumbnailUrl', { optional: true }),
            caption: args.caption || null,
            storeId: args.storeId || null,
            productIds: Array.isArray(args.productIds) ? args.productIds.map(String) : undefined,
            hashtags: Array.isArray(args.hashtags) ? args.hashtags.map(String) : undefined,
          },
        },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'hub_create_story',
    description: 'Post a Hub store story (image or MP4) on a store profile. Requires a Content or All jobs key and the content-rights agreement. Stories expire after expiresInHours (default 24, max 168). Tag productIds so the story links to the products. Hub is not Social Studio.',
    inputSchema: {
      type: 'object',
      properties: {
        mediaUrl: { type: 'string' },
        mediaType: { type: 'string', description: 'image or video' },
        thumbnailUrl: { type: 'string' },
        caption: { type: 'string' },
        linkUrl: { type: 'string' },
        storeId: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        hashtags: { type: 'array', items: { type: 'string' } },
        expiresInHours: { type: 'number' },
      },
      required: ['mediaUrl', 'storeId'],
    },
    execute: (args) => {
      const mediaType = args.mediaType === 'video' || /\.mp4($|\?)/i.test(String(args.mediaUrl)) ? 'video' : 'image';
      const hours = Math.min(Math.max(Math.round(Number(args.expiresInHours) || 24), 1), 168);
      return adminGraphql(
        `mutation CreateStoreStory($mediaUrl: String!, $mediaType: String, $thumbnailUrl: String, $caption: String, $linkUrl: String, $storeId: ID, $productIds: [ID!], $hashtags: [String!], $expiresInHours: Int) { createStoreStory(mediaUrl: $mediaUrl, mediaType: $mediaType, thumbnailUrl: $thumbnailUrl, caption: $caption, linkUrl: $linkUrl, storeId: $storeId, productIds: $productIds, hashtags: $hashtags, expiresInHours: $expiresInHours) { id storeId mediaType productIds expiresAt } }`,
        {
          mediaUrl: httpsUrl(args.mediaUrl, 'mediaUrl'),
          mediaType,
          thumbnailUrl: httpsUrl(args.thumbnailUrl, 'thumbnailUrl', { optional: true }),
          caption: args.caption || null,
          linkUrl: httpsUrl(args.linkUrl, 'linkUrl', { optional: true, allowHttp: true }),
          storeId: String(args.storeId),
          productIds: Array.isArray(args.productIds) ? args.productIds.map(String) : undefined,
          hashtags: Array.isArray(args.hashtags) ? args.hashtags.map(String) : undefined,
          expiresInHours: hours,
        },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'hub_publish_scene',
    description: 'Queue a finished MP4 as a Hub scene through the server publish pipeline (transcode, then live; returns status processing). Hub is not Social Studio. Requires a Content or All jobs key whose owner accepted the content-rights agreement; the key carries that acceptance. For a scene that should appear at once, hub_create_scene publishes the same MP4 directly.',
    inputSchema: {
      type: 'object',
      properties: {
        videoUrl: { type: 'string', description: 'A finished MP4 on the asset CDN (not a .mp4.png poster)' },
        duration: { type: 'number', description: 'Seconds' },
        title: { type: 'string' },
        caption: { type: 'string' },
        hashtags: { type: 'array', items: { type: 'string' } },
        productIds: { type: 'array', items: { type: 'string' } },
        storeId: { type: 'string', description: 'Hub store id when the key covers several stores' },
        thumbnailUrl: { type: 'string' },
      },
      required: ['videoUrl', 'duration'],
    },
    execute: (args) => hubGraphql(
      `mutation PublishScene($input: BeginAsyncScenePublishInput!) { beginAsyncScenePublish(input: $input) { id title status hubPermalink } }`,
      { input: scenePublishInput(args) },
      { allowWrite: true },
    ),
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
      return hubGraphql(
        `mutation UpdateStorePost($postId: ID!, $input: UpdateStorePostInput!) { updateStorePost(postId: $postId, input: $input) { id title hubPermalink } }`,
        { postId: String(args.postId), input },
        { allowWrite: true },
      );
    },
  },
];
