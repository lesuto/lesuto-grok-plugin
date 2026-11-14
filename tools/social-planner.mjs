import { adminGraphql } from '../lib/graphql.mjs';

/**
 * Social Studio planner tools: brands (accounts grouped as Lesuto Home, Apparel and so on),
 * so an agent can work across every brand account without opening a browser.
 */

const BRAND_FIELDS = 'id name color sortOrder connectionIds';
const PLANNER_POST_FIELDS = 'id connectionId status caption scheduledAt postedAt createdAt publishedUrl errorMessage riskTier storeId latestMetrics { impressions likes comments shares clicks } connection { id platform accountName status }';
const BULK_FIELDS = 'updated { id status scheduledAt } failures { postId message }';
const REPORT_FIELDS = 'id name frequency groupBy rangeDays connectionIds brandGroupIds enabled lastSentAt nextRunAt';

const PLANNER_STATUSES = new Set(['draft_review', 'scheduled', 'posting', 'posted', 'failed', 'cancelled']);

export function statusListArg(raw) {
  if (raw == null) return null;
  const list = (Array.isArray(raw) ? raw : [raw]).map((s) => String(s).trim()).filter(Boolean);
  const bad = list.find((s) => !PLANNER_STATUSES.has(s));
  if (bad) throw new Error(`Unknown status ${bad}. Use draft_review, scheduled, posting, posted, failed or cancelled.`);
  return list;
}

export function isoArg(raw, label) {
  if (raw == null || raw === '') return null;
  const d = new Date(String(raw));
  if (Number.isNaN(d.getTime())) throw new Error(`${label} must be an ISO date such as 2026-11-09T15:00:00Z.`);
  return d.toISOString();
}

export function idListArg(raw, label) {
  if (raw == null) return null;
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array of ids.`);
  const ids = raw.map((v) => Number(v)).filter((n) => Number.isInteger(n) && n > 0);
  if (ids.length !== raw.length) throw new Error(`${label} must hold positive whole numbers.`);
  return [...new Set(ids)];
}

export const socialPlannerTools = [
  {
    name: 'social_brands',
    description: 'List Social Studio brands (for example Lesuto Home, Lesuto Apparel) with their color and the connection ids of the accounts in each. Pair with social_connections for platform and account names.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(`query SocialBrands { socialBrandGroups { ${BRAND_FIELDS} } }`),
  },
  {
    name: 'social_brand_save',
    description: 'Create or update a brand. Pass id to update. connectionIds, when given, is the full list of accounts in the brand afterwards (accounts move out of any other brand). color is a hex value such as #16A34A. Deleting a brand stays with a person.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        color: { type: 'string' },
        connectionIds: { type: 'array', items: { type: 'number' } },
      },
      required: ['name'],
    },
    execute: (args) => adminGraphql(
      `mutation SaveBrand($input: UpsertSocialBrandGroupInput!) { upsertSocialBrandGroup(input: $input) { ${BRAND_FIELDS} } }`,
      {
        input: {
          id: args.id ? String(args.id) : null,
          name: String(args.name || ''),
          color: args.color ? String(args.color) : null,
          connectionIds: idListArg(args.connectionIds, 'connectionIds'),
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_planner_posts',
    description: 'Planner view of Social Studio posts in a time window (scheduled time, else posted, else created), oldest first. Filter by brandGroupIds (from social_brands), connectionIds, platforms (instagram, facebook, threads, pinterest, x, linkedin, tiktok, youtube, bluesky), statuses, storeId. from and to are ISO; up to 100 days and 500 posts per call. Defaults to a week ago through four weeks ahead.',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' },
        brandGroupIds: { type: 'array', items: { type: 'string' } },
        connectionIds: { type: 'array', items: { type: 'number' } },
        platforms: { type: 'array', items: { type: 'string' } },
        statuses: { type: 'array', items: { type: 'string' } },
        storeId: { type: 'number' },
        take: { type: 'number' },
      },
    },
    execute: (args) => adminGraphql(
      `query PlannerPosts($filter: SocialPlannerPostFilterInput!) { socialPlannerPosts(filter: $filter) { ${PLANNER_POST_FIELDS} } }`,
      {
        filter: {
          from: isoArg(args.from, 'from'),
          to: isoArg(args.to, 'to'),
          brandGroupIds: args.brandGroupIds ? idListArg(args.brandGroupIds, 'brandGroupIds').map(String) : null,
          connectionIds: idListArg(args.connectionIds, 'connectionIds'),
          platforms: Array.isArray(args.platforms) ? args.platforms.map((p) => String(p).toLowerCase()) : null,
          statuses: statusListArg(args.statuses),
          storeId: args.storeId ?? null,
          take: args.take ?? null,
        },
      },
    ),
  },
  {
    name: 'social_posts_reschedule',
    description: 'Move one or more scheduled or in-review posts. Give scheduledAt (exact ISO time for every post) or shiftMinutes (move each post by that many minutes; negative is earlier). Status never changes, so posts in review stay in review. Quiet hours and holiday blackouts are refused per post; read failures.',
    inputSchema: {
      type: 'object',
      properties: {
        postIds: { type: 'array', items: { type: 'string' } },
        scheduledAt: { type: 'string' },
        shiftMinutes: { type: 'number' },
      },
      required: ['postIds'],
    },
    execute: (args) => adminGraphql(
      `mutation Reschedule($input: RescheduleSocialPostsInput!) { rescheduleSocialPosts(input: $input) { ${BULK_FIELDS} } }`,
      {
        input: {
          postIds: idListArg(args.postIds, 'postIds').map(String),
          scheduledAt: isoArg(args.scheduledAt, 'scheduledAt'),
          shiftMinutes: args.shiftMinutes == null ? null : Math.round(Number(args.shiftMinutes)),
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_analytics_compare',
    description: 'Social Studio analytics across accounts. groupBy connection compares accounts side by side, brand rolls accounts up per brand, all combines them into one line. Pick accounts with connectionIds and/or brands with brandGroupIds (empty means every account). Returns per line: totals (impressions, reach, likes, comments, shares, saves, clicks, engagements, engagementRate %), followerCount where the network reports it, daily points and top posts. rangeDays 7 to 90. Call social_metrics_sync first if numbers look stale.',
    inputSchema: {
      type: 'object',
      properties: {
        groupBy: { type: 'string', enum: ['connection', 'brand', 'all'] },
        connectionIds: { type: 'array', items: { type: 'number' } },
        brandGroupIds: { type: 'array', items: { type: 'string' } },
        rangeDays: { type: 'number' },
        storeId: { type: 'number' },
        topPostsPerSeries: { type: 'number' },
        includeDaily: { type: 'boolean', description: 'Include the daily points (default true).' },
      },
    },
    execute: (args) => {
      const groupBy = args.groupBy == null ? 'connection' : String(args.groupBy);
      if (!['connection', 'brand', 'all'].includes(groupBy)) throw new Error('groupBy must be connection, brand or all.');
      const metrics = 'posts posted impressions reach likes comments shares saves clicks engagementScore engagements engagementRate';
      const points = args.includeDaily === false ? '' : `points { day ${metrics} }`;
      return adminGraphql(
        `query Compare($input: SocialAnalyticsCompareInput!) { socialAnalyticsCompare(input: $input) { rangeDays groupBy series { key label platform connectionIds followerCount totals { ${metrics} } ${points} topPosts { id connectionId caption platform accountName engagementRate impressions clicks postedAt publishedUrl } } } }`,
        {
          input: {
            groupBy,
            connectionIds: idListArg(args.connectionIds, 'connectionIds'),
            brandGroupIds: args.brandGroupIds ? idListArg(args.brandGroupIds, 'brandGroupIds').map(String) : null,
            rangeDays: args.rangeDays ?? 30,
            storeId: args.storeId ?? null,
            topPostsPerSeries: args.topPostsPerSeries ?? 5,
          },
        },
      );
    },
  },
  {
    name: 'social_posts_approve',
    description: 'Approve posts waiting in review (status draft_review), up to 200 at once. Each goes through the same checks as approving one (high-risk approval, alt text). Only do this when the merchant approved these posts. Read failures for posts that were skipped.',
    inputSchema: { type: 'object', properties: { postIds: { type: 'array', items: { type: 'string' } } }, required: ['postIds'] },
    execute: (args) => adminGraphql(
      `mutation Approve($postIds: [ID!]!) { approveSocialPosts(postIds: $postIds) { ${BULK_FIELDS} } }`,
      { postIds: idListArg(args.postIds, 'postIds').map(String) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_posts_cancel',
    description: 'Cancel scheduled or in-review posts, up to 200 at once, so they never publish. Live posts are not touched. Read failures for posts that were skipped.',
    inputSchema: { type: 'object', properties: { postIds: { type: 'array', items: { type: 'string' } } }, required: ['postIds'] },
    destructiveHint: true,
    execute: (args) => adminGraphql(
      `mutation Cancel($postIds: [ID!]!) { cancelSocialPosts(postIds: $postIds) { ${BULK_FIELDS} } }`,
      { postIds: idListArg(args.postIds, 'postIds').map(String) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_queue_slots',
    description: 'Next free posting slots per account (what addToQueue on social_post_schedule would use), plus each account\'s weekly slots via social_connections.',
    inputSchema: { type: 'object', properties: { connectionIds: { type: 'array', items: { type: 'number' } }, count: { type: 'number' } }, required: ['connectionIds'] },
    execute: (args) => adminGraphql(
      `query QueueSlots($connectionIds: [Int!]!, $count: Int) { socialQueueSlots(connectionIds: $connectionIds, count: $count) { connectionId times } }`,
      { connectionIds: idListArg(args.connectionIds, 'connectionIds'), count: args.count ?? 3 },
    ),
  },
  {
    name: 'social_posting_slots_set',
    description: 'Set an account\'s weekly posting slots for the queue: slots is a list of { day: 0 (Sunday) to 6, time: "HH:MM" } in timezone (IANA, for example America/New_York). An empty list turns the queue off for that account.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionId: { type: 'number' },
        slots: { type: 'array', items: { type: 'object', properties: { day: { type: 'number' }, time: { type: 'string' } } } },
        timezone: { type: 'string' },
      },
      required: ['connectionId', 'slots'],
    },
    execute: (args) => adminGraphql(
      `mutation SetSlots($connectionId: ID!, $slots: [SocialPostingSlotInput!]!, $timezone: String) { setSocialPostingSlots(connectionId: $connectionId, slots: $slots, timezone: $timezone) { id postingSlots { day time } postingTimezone } }`,
      {
        connectionId: String(idListArg([args.connectionId], 'connectionId')[0]),
        slots: (Array.isArray(args.slots) ? args.slots : []).map((s) => ({ day: Number(s.day), time: String(s.time) })),
        timezone: args.timezone ?? null,
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_post_recycle',
    description: 'Share a post that already went out again on the same account (evergreen). addToQueue puts it at the next free slot, or give scheduledAt. It lands in review for the merchant to approve.',
    inputSchema: { type: 'object', properties: { postId: { type: 'string' }, addToQueue: { type: 'boolean' }, scheduledAt: { type: 'string' } }, required: ['postId'] },
    execute: (args) => adminGraphql(
      `mutation Recycle($postId: ID!, $addToQueue: Boolean, $scheduledAt: String) { recycleSocialPost(postId: $postId, addToQueue: $addToQueue, scheduledAt: $scheduledAt, asDraftReview: true) { id status scheduledAt recycledFromPostId } }`,
      { postId: String(idListArg([args.postId], 'postId')[0]), addToQueue: args.addToQueue === true, scheduledAt: isoArg(args.scheduledAt, 'scheduledAt') },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_reports',
    description: 'Saved Social Studio analytics reports (name, schedule, grouping, accounts or brands, last and next send).',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(`query Reports { socialAnalyticsReports { ${REPORT_FIELDS} } }`),
  },
  {
    name: 'social_report_save',
    description: 'Create or update a saved analytics report. frequency weekly (Monday 08:00 UTC), monthly (the 1st) or off; groupBy connection, brand or all; connectionIds and brandGroupIds pick the accounts (empty means all). It is emailed with a CSV to the channel\'s Social Reports recipients.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        frequency: { type: 'string', enum: ['weekly', 'monthly', 'off'] },
        groupBy: { type: 'string', enum: ['connection', 'brand', 'all'] },
        rangeDays: { type: 'number' },
        connectionIds: { type: 'array', items: { type: 'number' } },
        brandGroupIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    execute: (args) => adminGraphql(
      `mutation SaveReport($input: UpsertSocialAnalyticsReportInput!) { upsertSocialAnalyticsReport(input: $input) { ${REPORT_FIELDS} } }`,
      {
        input: {
          id: args.id ? String(args.id) : null,
          name: String(args.name || ''),
          frequency: args.frequency || 'weekly',
          groupBy: args.groupBy || 'connection',
          rangeDays: args.rangeDays ?? null,
          connectionIds: idListArg(args.connectionIds, 'connectionIds') || [],
          brandGroupIds: args.brandGroupIds ? idListArg(args.brandGroupIds, 'brandGroupIds').map(String) : [],
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_report_send',
    description: 'Email a saved analytics report now, with its CSV. Returns how many addresses it went to.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => adminGraphql(
      `mutation SendReport($id: ID!) { sendSocialAnalyticsReport(id: $id) }`,
      { id: String(idListArg([args.id], 'id')[0]) },
      { allowWrite: true },
    ),
  },
];
