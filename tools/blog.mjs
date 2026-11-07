import { wrapCreditTool } from '../lib/credit-confirm.mjs';
import { adminGraphql } from '../lib/graphql.mjs';

const POST_FIELDS = `id slug title excerpt status author tags featuredImageUrl publishedAt createdAt articleType articleLayout websiteIds`;
const POST_DETAIL = `${POST_FIELDS} body seoTitle seoDescription`;

function slugify(title) {
  return String(title || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'post';
}

function postInput(args) {
  const title = String(args.title || '').trim();
  return {
    title,
    slug: String(args.slug || slugify(title)),
    excerpt: args.excerpt || null,
    body: args.body || null,
    featuredImageUrl: args.featuredImageUrl || null,
    author: args.author || 'Agent',
    tags: Array.isArray(args.tags) ? args.tags : undefined,
    articleType: args.articleType || null,
    articleLayout: args.articleLayout || null,
    seoTitle: args.seoTitle || null,
    seoDescription: args.seoDescription || null,
    status: args.status === 'scheduled' ? 'scheduled' : 'draft',
    scheduledAt: args.scheduledAt || null,
    websiteIds: Array.isArray(args.websiteIds) ? args.websiteIds.map(String) : undefined,
  };
}

const RAW_BLOG_TOOLS = [
  {
    name: 'blog_list',
    description: 'List Command Center blog posts for this channel (draft, published, or all). Your agent can autoblog here instead of Lesuto AI Blog. Up to 50 per call; page with offset (offset 50 for the next 50) until you have totalItems.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'draft, published, scheduled, or omit for all' },
        limit: { type: 'number', description: 'Posts per call, at most 50 (default 20).' },
        offset: { type: 'number', description: 'Posts to skip, for the next page (default 0).' },
      },
    },
    execute: (args) => adminGraphql(
      `query ChannelBlogPostsAdmin($status: String, $limit: Int, $offset: Int) { channelBlogPostsAdmin(status: $status, limit: $limit, offset: $offset) { totalItems items { ${POST_FIELDS} } } }`,
      {
        status: args.status || null,
        limit: Math.min(Number(args.limit) || 20, 50),
        offset: Math.max(Math.floor(Number(args.offset) || 0), 0),
      },
    ),
  },
  {
    name: 'blog_get',
    description: 'Read one Command Center blog post by id, including body.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `query AiBlogPost($id: ID!) { aiBlogPost(id: $id) { ${POST_DETAIL} } }`,
      { id: String(args.id) },
    ),
  },
  {
    name: 'blog_create',
    description: 'Create a channel blog post in Command Center. Requires a Content or All jobs key. Defaults to draft. Set publish true to publish immediately. Body must be magazine HTML: figure.lsu-media.lsu-media-product for product photos, figure.lsu-media.lsu-media-shot for UI, and a two-link CTA. articleLayout is playbook, aisle, explainer, feature, essay, or split. Do not ask image models to paint LESUTO or titles.',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        body: { type: 'string' },
        featuredImageUrl: { type: 'string' },
        author: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        articleType: { type: 'string' },
        articleLayout: { type: 'string' },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        websiteIds: { type: 'array', items: { type: 'string' }, description: 'Deployment ids of the websites that show this post. Omit for every website of the channel whose blog scope is all.' },
        publish: { type: 'boolean' },
      },
      required: ['title'],
    },
    execute: async (args) => {
      const created = await adminGraphql(
        `mutation ChannelBlogCreatePost($input: AiBlogPostInput!) { channelBlogCreatePost(input: $input) { ${POST_FIELDS} } }`,
        { input: postInput(args) },
        { allowWrite: true },
      );
      const post = created.channelBlogCreatePost;
      if (!args.publish) return created;
      const published = await adminGraphql(
        `mutation AiBlogPublishPost($id: ID!) { aiBlogPublishPost(id: $id) { ${POST_FIELDS} } }`,
        { id: post.id },
        { allowWrite: true },
      );
      return published;
    },
  },
  {
    name: 'blog_generate',
    description: 'Write a draft with Lesuto AI Blog (the same writer as Command Center and Studio). Charges AI credits. Requires a Content or All jobs key. Always a draft. Pass websiteIds to put it on those websites only.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string', description: 'What the article is about, who reads it, and the facts it may use.' },
        articleType: { type: 'string' },
        articleLayout: { type: 'string', description: 'playbook, aisle, explainer, feature, essay, or split' },
        tone: { type: 'string' },
        productNames: { type: 'array', items: { type: 'string' } },
        linkedProductIds: { type: 'array', items: { type: 'number' } },
        modelTier: { type: 'string' },
        websiteIds: { type: 'array', items: { type: 'string' }, description: 'Deployment ids of the websites that show this post. Omit for every website of the channel whose blog scope is all.' },
      },
      required: ['prompt'],
    },
    execute: async (args) => {
      const input = { prompt: String(args.prompt || '').trim() };
      for (const key of ['articleType', 'articleLayout', 'tone', 'modelTier']) {
        if (args[key]) input[key] = String(args[key]);
      }
      if (Array.isArray(args.productNames)) input.productNames = args.productNames.map(String);
      if (Array.isArray(args.linkedProductIds)) input.linkedProductIds = args.linkedProductIds.map(Number);
      const generated = await adminGraphql(
        `mutation ChannelBlogGeneratePost($input: AiBlogGenerateInput!) { channelBlogGeneratePost(input: $input) { id slug title excerpt status creditsUsed } }`,
        { input },
        { allowWrite: true },
      );
      if (!Array.isArray(args.websiteIds)) return generated;
      // The draft is written and paid for: a failed website assignment must not look like a failed
      // generation, or a retry would write (and charge for) a second draft.
      try {
        return await adminGraphql(
          `mutation AiBlogUpdatePost($id: ID!, $input: AiBlogUpdateInput!) { aiBlogUpdatePost(id: $id, input: $input) { ${POST_FIELDS} } }`,
          { id: generated.channelBlogGeneratePost.id, input: { websiteIds: args.websiteIds.map(String) } },
          { allowWrite: true },
        );
      } catch (err) {
        return {
          ...generated,
          websiteIdsError: `The draft was written (id ${generated.channelBlogGeneratePost.id}) but not put on those websites: ${err?.message || err}. Use blog_update with websiteIds; do not generate it again.`,
        };
      }
    },
  },
  {
    name: 'blog_update',
    description: 'Update a Command Center blog post by id. Requires a Content or All jobs key. Pass only fields to change.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        slug: { type: 'string' },
        excerpt: { type: 'string' },
        body: { type: 'string' },
        featuredImageUrl: { type: 'string' },
        author: { type: 'string' },
        tags: { type: 'array', items: { type: 'string' } },
        articleType: { type: 'string' },
        articleLayout: { type: 'string' },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        websiteIds: { type: 'array', items: { type: 'string' }, description: 'Deployment ids of the websites that show this post. Omit for every website of the channel whose blog scope is all.' },
      },
      required: ['id'],
    },
    execute: (args) => {
      const input = {};
      for (const key of ['title', 'slug', 'excerpt', 'body', 'featuredImageUrl', 'author', 'seoTitle', 'seoDescription', 'articleType', 'articleLayout']) {
        if (args[key] != null) input[key] = args[key];
      }
      if (Array.isArray(args.tags)) input.tags = args.tags;
      if (Array.isArray(args.websiteIds)) input.websiteIds = args.websiteIds.map(String);
      return adminGraphql(
        `mutation AiBlogUpdatePost($id: ID!, $input: AiBlogUpdateInput!) { aiBlogUpdatePost(id: $id, input: $input) { ${POST_DETAIL} } }`,
        { id: String(args.id), input },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'blog_publish',
    description: 'Publish a Command Center blog post so it appears on the store blog feed. Requires a Content or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `mutation AiBlogPublishPost($id: ID!) { aiBlogPublishPost(id: $id) { ${POST_FIELDS} } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'blog_unpublish',
    description: 'Revert a Command Center blog post to draft. Requires a Content or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `mutation AiBlogUnpublishPost($id: ID!) { aiBlogUnpublishPost(id: $id) { ${POST_FIELDS} } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'blog_bake_cover',
    description: 'Bake LESUTO, the post title and the "Let\'s Succeed Together" motto onto the post\'s cover background (an untyped charcoal plate from the media library) and set the baked image as the cover. No AI credits. Run it once per new cover; it refuses a cover that already has its title. Requires a Content or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `mutation AiBlogBakeCover($id: ID!) { aiBlogBakeCover(id: $id) { ${POST_FIELDS} } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
];

export const blogTools = RAW_BLOG_TOOLS.map(wrapCreditTool);
