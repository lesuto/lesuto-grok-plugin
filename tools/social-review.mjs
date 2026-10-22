import { adminGraphql } from '../lib/graphql.mjs';

/**
 * Review-queue help for the merchant: revise a post by instruction ("the house
 * is red, make it blue"), compare the new version, accept or discard it, and
 * set the approval setting (approve each post or post automatically).
 * Approving the post itself is studio_review_resolve with action accept.
 */

const VERSION_FIELDS = 'caption hashtags mediaItems { url type altText }';
const REVISION_FIELDS = `id postId kind status instruction messages { role content } before { ${VERSION_FIELDS} } after { ${VERSION_FIELDS} } identityCheck creditsUsed errorMessage videoStep videoSceneLabel createdAt`;
const APPROVAL_FIELDS = 'scope id approvalMode effectiveApprovalMode inherited growthLineId';

export const REVISE_TARGETS = new Set(['caption', 'image', 'video', 'auto']);
export const APPROVAL_SCOPES = new Set(['growth_line', 'cadence', 'campaign']);
export const APPROVAL_MODES = new Set(['review', 'auto', 'inherit']);

export function reviseTargetArg(raw) {
  const target = raw == null || raw === '' ? 'auto' : String(raw).trim().toLowerCase();
  if (!REVISE_TARGETS.has(target)) throw new Error('target must be caption, image, video, or auto.');
  return target;
}

/** Credits to quote before a turn. "auto" quotes the most it could cost on this post. */
export function reviseQuote(target, pricing, mediaTypes = []) {
  const caption = Number(pricing?.captionRevise || 0);
  const image = Number(pricing?.imageEdit || 0);
  const video = Number(pricing?.videoScene || 0) + Number(pricing?.timelineStitch || 0);
  if (target === 'caption') return { credits: caption, label: 'caption revise' };
  if (target === 'image') return { credits: image, label: 'image edit' };
  if (target === 'video') return { credits: video, label: 'video scene change (keyframe edit, scene render, restitch)' };
  if (mediaTypes.includes('VIDEO')) return { credits: video, label: 'change (up to a video scene change)' };
  if (mediaTypes.includes('IMAGE')) return { credits: image, label: 'change (up to an image edit)' };
  return { credits: caption, label: 'caption revise' };
}

async function quoteRevise(args, target) {
  const data = await adminGraphql(
    `query RevisePricing($id: ID!) { socialPostRevisePricing { canSpend balance captionRevise imageEdit videoScene timelineStitch } socialAutomationPost(id: $id) { id status mediaItems { type } } }`,
    { id: String(args.postId) },
  );
  const pricing = data.socialPostRevisePricing || {};
  const post = data.socialAutomationPost || {};
  const quote = reviseQuote(target, pricing, (post.mediaItems || []).map((m) => m.type));
  const balance = Number(pricing.balance || 0);
  return {
    needsConfirm: true,
    credits: quote.credits,
    balance,
    remainingAfter: balance - quote.credits,
    canSpend: pricing.canSpend !== false,
    postStatus: post.status,
    message: `This ${quote.label} will use about ${quote.credits} AI credits (balance ${balance}). Call again with confirm true after the merchant agrees. Nothing changes on the post until the new version is accepted.`,
  };
}

export const socialReviewTools = [
  {
    name: 'social_post_revise',
    description: 'Ask for a change to a Social Studio review-queue post in the merchant\'s words (for example "the house is red, make it blue" or "make the caption shorter"). Edits the caption, the image (the real product stays identical), or one video scene. Returns a new version to compare; keep chatting by calling again on the same post. Quote AI credits first, then call with confirm true.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string' },
        instruction: { type: 'string', description: 'What to change, in the merchant\'s words.' },
        target: { type: 'string', description: 'caption | image | video | auto (default).' },
        revisionId: { type: 'string', description: 'Continue from this version. Defaults to the post\'s open version.' },
        confirm: { type: 'boolean', description: 'Required after the credit quote. Agents cannot buy credits.' },
      },
      required: ['postId', 'instruction'],
    },
    execute: async (args) => {
      const target = reviseTargetArg(args.target);
      if (args.confirm !== true) return quoteRevise(args, target);
      const data = await adminGraphql(
        `mutation Revise($input: ReviseSocialPostInput!) { reviseSocialPost(input: $input) { ${REVISION_FIELDS} } }`,
        {
          input: {
            postId: String(args.postId),
            instruction: String(args.instruction),
            target,
            revisionId: args.revisionId ? String(args.revisionId) : null,
          },
        },
        { allowWrite: true },
      );
      const revision = data.reviseSocialPost;
      return {
        revision,
        next: revision?.status === 'rendering'
          ? 'The video scene is re-rendering. Call social_post_revision_status with this revision id until status is proposed, then show both versions.'
          : revision?.status === 'proposed'
            ? 'Show the merchant before and after. Accept with social_post_revision_accept, discard with social_post_revision_discard, or call social_post_revise again to keep changing it.'
            : 'The change was not made. Relay errorMessage to the merchant.',
      };
    },
  },
  {
    name: 'social_post_revisions',
    description: 'Revise history of a review-queue post: who asked, what they asked, and each before and after version.',
    inputSchema: { type: 'object', properties: { postId: { type: 'string' } }, required: ['postId'] },
    execute: (args) => adminGraphql(
      `query Revisions($postId: ID!) { socialPostRevisions(postId: $postId) { ${REVISION_FIELDS} } }`,
      { postId: String(args.postId) },
    ),
  },
  {
    name: 'social_post_revision_status',
    description: 'Move a rendering video change forward and return it. status proposed means the new cut is ready to compare.',
    inputSchema: { type: 'object', properties: { revisionId: { type: 'string' } }, required: ['revisionId'] },
    execute: (args) => adminGraphql(
      `mutation RefreshRevision($id: ID!) { refreshSocialPostRevision(id: $id) { ${REVISION_FIELDS} } }`,
      { id: String(args.revisionId) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_post_revision_accept',
    description: 'Apply a ready version to the post when the merchant says they like it. The post stays in the review queue; approve it with studio_review_resolve action accept.',
    inputSchema: { type: 'object', properties: { revisionId: { type: 'string' } }, required: ['revisionId'] },
    execute: (args) => adminGraphql(
      `mutation AcceptRevision($id: ID!) { acceptSocialPostRevision(id: $id) { ${REVISION_FIELDS} } }`,
      { id: String(args.revisionId) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_post_revision_discard',
    description: 'Drop a ready version. The post, and any Studio scene the change touched, stay as they were.',
    inputSchema: { type: 'object', properties: { revisionId: { type: 'string' } }, required: ['revisionId'] },
    execute: (args) => adminGraphql(
      `mutation DiscardRevision($id: ID!) { discardSocialPostRevision(id: $id) { ${REVISION_FIELDS} } }`,
      { id: String(args.revisionId) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_approval_mode_get',
    description: 'Read the approval setting of a Growth Line, autopilot (cadence), or campaign: approve each post (review) or post automatically (auto), and whether it follows its Growth Line.',
    inputSchema: {
      type: 'object',
      properties: { scope: { type: 'string', description: 'growth_line | cadence | campaign' }, id: { type: 'string' } },
      required: ['scope', 'id'],
    },
    execute: (args) => {
      const scope = String(args.scope || '');
      if (!APPROVAL_SCOPES.has(scope)) throw new Error('scope must be growth_line, cadence, or campaign.');
      return adminGraphql(
        `query Approval($scope: String!, $id: ID!) { socialApprovalSetting(scope: $scope, id: $id) { ${APPROVAL_FIELDS} } }`,
        { scope, id: String(args.id) },
      );
    },
  },
  {
    name: 'social_approval_mode_set',
    description: 'Set the approval setting only when the merchant asks. On a Growth Line: review (approve each post) or auto (post automatically); its autopilot and campaigns follow it. On one autopilot (cadence) or campaign: review, auto, or inherit to follow the Growth Line again. Automatic posting still stops for the kill switch, quiet hours, the safety review, and high-risk posts.',
    inputSchema: {
      type: 'object',
      properties: {
        scope: { type: 'string', description: 'growth_line | cadence | campaign' },
        id: { type: 'string' },
        mode: { type: 'string', description: 'review | auto | inherit' },
      },
      required: ['scope', 'id', 'mode'],
    },
    execute: (args) => {
      const scope = String(args.scope || '');
      const mode = String(args.mode || '');
      if (!APPROVAL_SCOPES.has(scope)) throw new Error('scope must be growth_line, cadence, or campaign.');
      if (!APPROVAL_MODES.has(mode)) throw new Error('mode must be review, auto, or inherit.');
      return adminGraphql(
        `mutation SetApproval($input: SetSocialApprovalModeInput!) { setSocialApprovalMode(input: $input) { ${APPROVAL_FIELDS} } }`,
        { input: { scope, id: String(args.id), mode } },
        { allowWrite: true },
      );
    },
  },
];
