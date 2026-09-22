import { adminGraphql } from '../lib/graphql.mjs';

const POST_FIELDS = `id slug title excerpt status author tags featuredImageUrl publishedAt createdAt articleType articleLayout`;
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
  };
}

export const blogTools = [
  {
    name: 'blog_list',
    description: 'List Command Center blog posts for this channel (draft, published, or all). Your agent can autoblog here instead of Lesuto AI Blog.',
    inputSchema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'draft, published, scheduled, or omit for all' },
        limit: { type: 'number' },
      },
    },
    execute: (args) => adminGraphql(
      `query ChannelBlogPostsAdmin($status: String, $limit: Int) { channelBlogPostsAdmin(status: $status, limit: $limit) { totalItems items { ${POST_FIELDS} } } }`,
      { status: args.status || null, limit: Math.min(Number(args.limit) || 20, 50) },
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
      },
      required: ['id'],
    },
    execute: (args) => {
      const input = {};
      for (const key of ['title', 'slug', 'excerpt', 'body', 'featuredImageUrl', 'author', 'seoTitle', 'seoDescription', 'articleType', 'articleLayout']) {
        if (args[key] != null) input[key] = args[key];
      }
      if (Array.isArray(args.tags)) input.tags = args.tags;
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
];
