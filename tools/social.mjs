import { adminGraphql } from '../lib/graphql.mjs';
import { wrapCreditTool } from '../lib/credit-confirm.mjs';

const GROWTH_FIELDS = `id name slug promise audience tone pillars topicsIn topicsOut ctaLadder characterIds status storeId`;
const CAMPAIGN_FIELDS = `id name recipeType status storeId creditHoldId estimatedCredits config reviewDefault`;
const STUDIO_DURATIONS = [6, 8, 15, 30];

export function snapStudioDuration(raw) {
  const n = Number(raw);
  const want = Number.isFinite(n) && n > 0 ? n : 8;
  return STUDIO_DURATIONS.reduce((best, d) => {
    const dDelta = Math.abs(d - want);
    const bestDelta = Math.abs(best - want);
    if (dDelta < bestDelta) return d;
    if (dDelta === bestDelta) return d < best ? d : best;
    return best;
  }, STUDIO_DURATIONS[0]);
}

export const SOCIAL_OPERATOR_GUIDE = `You operate Lesuto Social Studio as this merchant. Hub is a separate surface. Social Studio publishes to Instagram, Facebook, Pinterest, X, LinkedIn, TikTok, and YouTube, not to Hub.

Workflow:
1. Read brand voice, connections, and growth lines.
2. Draft a growth line with social_growth_line_draft if none exists, then save after the merchant would review it.
3. Draft a campaign with social_campaign_draft, show the credit estimate, then save, reserve, and arm.
4. Call studio_video_plan before spend. For a written script, use stepwise studio_* tools (character, look, voice lock, brief, script, scenes, cheap keyframes, then render). studio_produce_video is the hands-free shortcut. Quote AI credits, then confirm true. Call studio_stores when this merchant has more than one Hub store. Do not pass list_stores L-codes as storeId. Poll studio_job_status for the MP4 outputUrl. Length snaps to 6, 8, 15, or 30 seconds. Voiceover is off unless includeAudio is true.
5. Stop after stills and after the MP4 so the merchant can approve. Schedule posts with social_post_schedule and mediaItems (the MP4 URL) at an exact ISO scheduledAt. They land in the review queue. Resolve with studio_review_resolve.
6. Never work around a safety block, never turn the kill switch off, never buy credits, never connect OAuth accounts. Never call ElevenLabs directly. Voices go through studio_voices_search and studio_character_lock_voice.

Credits: each AI draft and generation spends AI credits on this channel, plus integration credits per GraphQL write.`;

const RAW_SOCIAL_TOOLS = [
  {
    name: 'studio_operator_guide',
    description: 'How to operate Social Studio as this merchant. Read this before drafting campaigns or video.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => SOCIAL_OPERATOR_GUIDE,
  },
  {
    name: 'social_connections',
    description: 'List connected social accounts for this channel.',
    inputSchema: { type: 'object', properties: { storeId: { type: 'number' } } },
    execute: (args) => adminGraphql(
      `query SocialConnections($storeId: Int) { socialConnections(storeId: $storeId) { id platform accountName status storeId } }`,
      { storeId: args.storeId ?? null },
    ),
  },
  {
    name: 'social_growth_line_draft',
    description: 'Draft a Growth Line with AI. Charges AI credits. Does not save. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: {
        description: { type: 'string' },
        sourceUrl: { type: 'string' },
      },
    },
    execute: (args) => adminGraphql(
      `mutation DraftGrowth($input: DraftSocialGrowthLineAiInput!) {
        draftSocialGrowthLineWithAi(input: $input) { name promise audience tone pillars topicsIn topicsOut ctaLadder }
      }`,
      { input: { description: args.description || null, sourceUrl: args.sourceUrl || null } },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_growth_line_save',
    description: 'Save a Growth Line. Use asDraft true for a name-only draft. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        promise: { type: 'string' },
        audience: { type: 'string' },
        tone: { type: 'string' },
        pillars: { type: 'array', items: { type: 'string' } },
        topicsIn: { type: 'array', items: { type: 'string' } },
        topicsOut: { type: 'array', items: { type: 'string' } },
        ctaLadder: { type: 'array', items: { type: 'string' } },
        asDraft: { type: 'boolean' },
        characterIds: { type: 'array', items: { type: 'number' } },
      },
      required: ['name'],
    },
    execute: (args) => adminGraphql(
      `mutation UpsertGrowth($input: UpsertSocialGrowthLineInput!) { upsertSocialGrowthLine(input: $input) { ${GROWTH_FIELDS} } }`,
      {
        input: {
          id: args.id || undefined,
          name: String(args.name),
          promise: args.promise || '',
          audience: args.audience || null,
          tone: args.tone || null,
          pillars: args.pillars,
          topicsIn: args.topicsIn,
          topicsOut: args.topicsOut,
          ctaLadder: args.ctaLadder,
          asDraft: !!args.asDraft,
          characterIds: Array.isArray(args.characterIds) ? args.characterIds.map(Number) : undefined,
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_campaign_draft',
    description: 'Draft a campaign from an active Growth Line. Charges AI credits. Returns a credit estimate. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: {
        growthLineId: { type: 'number' },
        goal: { type: 'string' },
        targets: { type: 'array', items: { type: 'string' } },
      },
      required: ['growthLineId'],
    },
    execute: (args) => adminGraphql(
      `mutation DraftCampaign($input: DraftSocialCampaignAiInput!) {
        draftSocialCampaignWithAi(input: $input) { name archPrompt cadencePerDay estimatedCredits topics targets }
      }`,
      {
        input: {
          growthLineId: Number(args.growthLineId),
          goal: args.goal || null,
          targets: Array.isArray(args.targets) ? args.targets : ['social'],
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_campaign_save',
    description: 'Save a campaign draft. Name is enough. Reserve credits before arming.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        estimatedCredits: { type: 'number' },
        config: { type: 'object' },
        targets: { type: 'array', items: { type: 'string' } },
      },
      required: ['name'],
    },
    execute: (args) => adminGraphql(
      `mutation UpsertCampaign($input: UpsertSocialCampaignInput!) { upsertSocialCampaign(input: $input) { ${CAMPAIGN_FIELDS} } }`,
      {
        input: {
          id: args.id || undefined,
          name: String(args.name),
          recipeType: 'custom',
          estimatedCredits: Number(args.estimatedCredits) || 120,
          targets: Array.isArray(args.targets) ? args.targets : undefined,
          config: args.config || {},
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_campaign_arm',
    description: 'Reserve credits if needed, then arm a campaign. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: async (args) => {
      await adminGraphql(
        `mutation ReserveCampaign($id: ID!) { reserveSocialCampaignCredits(id: $id) { id status creditHoldId } }`,
        { id: String(args.id) },
        { allowWrite: true },
      );
      return adminGraphql(
        `mutation ArmCampaign($id: ID!) { armSocialCampaign(id: $id) { id status creditHoldId } }`,
        { id: String(args.id) },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'social_campaign_pause',
    description: 'Pause an armed or running campaign.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `mutation PauseSocialCampaign($id: ID!) { pauseSocialCampaign(id: $id) { id status creditHoldId } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_generate_image',
    description: 'Generate a still for Social Studio. Charges AI credits. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: { prompt: { type: 'string' }, productId: { type: 'string' } },
      required: ['prompt'],
    },
    execute: (args) => adminGraphql(
      `mutation GenImage($input: AiGenerateImageInput!) { aiGenerateImage(input: $input) { assetId preview creditsUsed } }`,
      { input: { prompt: String(args.prompt), productId: args.productId || null } },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_generate_video',
    description: 'Start an async video job. Poll studio_job_status. Do not call the synchronous video mutation. Charges AI credits.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        durationSeconds: { type: 'number' },
        engine: { type: 'string' },
        aspectRatio: { type: 'string' },
      },
      required: ['prompt'],
    },
    execute: (args) => adminGraphql(
      `mutation GenVideoJob($input: AiGenerateVideoInput!) { aiGenerateVideoJob(input: $input) { jobId estimatedMs } }`,
      {
        input: {
          prompt: String(args.prompt),
          durationSeconds: Number(args.durationSeconds) || 6,
          engine: args.engine || null,
          aspectRatio: args.aspectRatio || '9:16',
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'studio_stores',
    description: 'List Hub stores on this channel for Social Studio video. Use the numeric id as storeId on studio_produce_video. This is not list_stores L-codes.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query StudioStores { videoProductionChannelContext { channelId channelCode channelName channelType storeRequired aiCreditBalance stores { id name slug } } }`,
    ),
  },
  {
    name: 'studio_produce_video',
    description: 'Start an async Social Studio video job (brief to stitched cut). Returns a job id. Poll studio_job_status. Duration snaps to 6, 8, 15, or 30 seconds. Merchant channels with more than one Hub store need storeId from studio_stores. Voiceover stays off unless includeAudio is true, and includeAudio needs a character with a locked voice.',
    inputSchema: {
      type: 'object',
      properties: {
        prompt: { type: 'string' },
        durationSeconds: { type: 'number' },
        aspectRatio: { type: 'string' },
        storeId: { type: 'number' },
        includeAudio: { type: 'boolean' },
        productId: { type: 'string' },
        characterId: { type: 'string' },
        engine: { type: 'string' },
        quality: { type: 'string' },
        imageAssetIds: { type: 'array', items: { type: 'string' } },
        termsAcknowledged: { type: 'boolean' },
      },
      required: ['prompt'],
    },
    execute: (args) => adminGraphql(
      `mutation ProduceVideo($input: AiGenerateVideoInput!) { aiProduceStudioVideoJob(input: $input) { jobId estimatedMs } }`,
      {
        input: {
          prompt: String(args.prompt),
          durationSeconds: snapStudioDuration(args.durationSeconds),
          aspectRatio: args.aspectRatio || 'auto',
          storeId: args.storeId != null ? Number(args.storeId) : null,
          includeAudio: args.includeAudio === true,
          productId: args.productId || null,
          characterId: args.characterId || null,
          engine: args.engine || null,
          quality: args.quality || null,
          imageAssetIds: args.imageAssetIds || null,
          termsAcknowledged: args.confirm === true || args.termsAcknowledged === true,
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'studio_job_status',
    description: 'Poll an async media job started by studio_produce_video or social_generate_video.',
    inputSchema: {
      type: 'object',
      properties: { jobId: { type: 'string' } },
      required: ['jobId'],
    },
    execute: (args) => adminGraphql(
      `query JobStatus($jobId: ID!) { aiMediaJobStatus(jobId: $jobId) { id state progress result { success totalCreditsUsed errorMessage outputUrl steps { preview success error } } duration } }`,
      { jobId: String(args.jobId) },
    ),
  },
  {
    name: 'studio_launch_campaign',
    description: 'Save a campaign from a Growth Line, show the estimate, reserve, and arm. Requires a Social or All jobs key.',
    inputSchema: {
      type: 'object',
      properties: {
        growthLineId: { type: 'number' },
        name: { type: 'string' },
        goal: { type: 'string' },
        estimatedCredits: { type: 'number' },
        archPrompt: { type: 'string' },
      },
      required: ['growthLineId', 'name'],
    },
    execute: async (args) => {
      const saved = await adminGraphql(
        `mutation LaunchSave($input: UpsertSocialCampaignInput!) { upsertSocialCampaign(input: $input) { ${CAMPAIGN_FIELDS} } }`,
        {
          input: {
            name: String(args.name),
            recipeType: 'custom',
            estimatedCredits: Number(args.estimatedCredits) || 120,
            config: {
              growthLineId: Number(args.growthLineId),
              targets: ['social'],
              arch: { prompt: args.archPrompt || args.goal || args.name },
            },
          },
        },
        { allowWrite: true },
      );
      const id = saved?.upsertSocialCampaign?.id;
      if (!id) return saved;
      await adminGraphql(
        `mutation LaunchReserve($id: ID!) { reserveSocialCampaignCredits(id: $id) { id status creditHoldId } }`,
        { id },
        { allowWrite: true },
      );
      return adminGraphql(
        `mutation LaunchArm($id: ID!) { armSocialCampaign(id: $id) { id status creditHoldId } }`,
        { id },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'studio_review_queue',
    description: 'List Social Studio posts waiting for a person to review.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ReviewQueue { socialAutomationPosts(status: "draft_review") { id caption platform status riskTier createdAt } }`,
    ),
  },
  {
    name: 'social_post_schedule',
    description: 'Schedule a social post to connected accounts. Lands in review by default.',
    inputSchema: {
      type: 'object',
      properties: {
        connectionIds: { type: 'array', items: { type: 'number' } },
        caption: { type: 'string' },
        scheduledAt: { type: 'string' },
        videoTitle: { type: 'string' },
        mediaItems: { type: 'array', items: { type: 'object' } },
      },
      required: ['connectionIds', 'caption'],
    },
    execute: (args) => adminGraphql(
      `mutation CreatePosts($input: CreateSocialPostsInput!) { createSocialPosts(input: $input) { posts { id status } } }`,
      {
        input: {
          connectionIds: args.connectionIds.map(Number),
          caption: String(args.caption),
          scheduledAt: args.scheduledAt || null,
          videoTitle: args.videoTitle || null,
          mediaItems: args.mediaItems || null,
          asDraftReview: true,
          publishGate: 'review_required',
        },
      },
      { allowWrite: true },
    ),
  },
  {
    name: 'blog_cadence_save',
    description: 'Save a Social Studio blog cadence on a Growth Line.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        growthLineId: { type: 'number' },
      },
      required: ['name', 'growthLineId'],
    },
    execute: (args) => adminGraphql(
      `mutation UpsertCadence($input: UpsertSocialBlogCadenceInput!) { upsertSocialBlogCadence(input: $input) { id name status growthLineId } }`,
      { input: { name: String(args.name), growthLineId: Number(args.growthLineId) } },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_campaign_resume',
    description: 'Resume a paused campaign.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => adminGraphql(
      `mutation ResumeSocialCampaign($id: ID!) { resumeSocialCampaign(id: $id) { id status } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_campaign_cancel',
    description: 'Cancel a campaign.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => adminGraphql(
      `mutation CancelSocialCampaign($id: ID!) { cancelSocialCampaign(id: $id) { id status } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_growth_lines',
    description: 'List Growth Lines on this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query { socialGrowthLines { ${GROWTH_FIELDS} } }`,
    ),
  },
  {
    name: 'social_campaigns',
    description: 'List Social Studio campaigns.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query { socialCampaigns { ${CAMPAIGN_FIELDS} } }`,
    ),
  },
  {
    name: 'social_growth_line_archive',
    description: 'Archive a Growth Line. It leaves the active list.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => adminGraphql(
      `mutation ArchiveLine($id: ID!) { archiveSocialGrowthLine(id: $id) }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_growth_line_research',
    description: 'Research a URL into a Growth Line. Charges AI credits.',
    inputSchema: {
      type: 'object',
      properties: { url: { type: 'string' }, notes: { type: 'string' }, storeId: { type: 'number' } },
      required: ['url'],
    },
    execute: (args) => adminGraphql(
      `mutation ResearchLine($url: String!, $notes: String, $storeId: Int) { researchSocialGrowthLine(url: $url, notes: $notes, storeId: $storeId) { ${GROWTH_FIELDS} } }`,
      { url: String(args.url), notes: args.notes || null, storeId: args.storeId ?? null },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_post_update',
    description: 'Edit a scheduled Social Studio post before it publishes.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, caption: { type: 'string' }, scheduledAt: { type: 'string' } },
      required: ['id'],
    },
    execute: (args) => adminGraphql(
      `mutation UpdatePost($id: ID!, $input: UpdateSocialPostInput!) { updateSocialPost(id: $id, input: $input) { id status } }`,
      { id: String(args.id), input: { caption: args.caption, scheduledAt: args.scheduledAt } },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_post_cancel',
    description: 'Cancel a scheduled Social Studio post.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => adminGraphql(
      `mutation CancelPost($id: ID!) { cancelSocialPost(id: $id) { id status } }`,
      { id: String(args.id) },
      { allowWrite: true },
    ),
  },
  {
    name: 'blog_cadence_status',
    description: 'Pause or resume a Social Studio blog cadence.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, status: { type: 'string' } },
      required: ['id', 'status'],
    },
    execute: (args) => adminGraphql(
      `mutation CadenceStatus($id: ID!, $status: String!) { setSocialBlogCadenceStatus(id: $id, status: $status) { id status } }`,
      { id: String(args.id), status: String(args.status) },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_kill_switch_on',
    description: 'Turn the Social Studio kill switch ON so outbound posts stop. This tool cannot turn it off.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `mutation KillOn($input: SetSocialKillSwitchInput!) { setSocialKillSwitch(input: $input) { killSwitchActive killSwitchReason } }`,
      { input: { active: true, reason: 'Grok operator requested a halt.' } },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_brand_voice_get',
    description: 'Read the Social Studio copy brand-voice pack for this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(`query { socialBrandVoicePack { id bannedTerms requiredDisclosures factsPack } }`),
  },
  {
    name: 'social_brand_voice_save',
    description: 'Save the Social Studio copy brand-voice pack. This is copy rules, not the Creative Studio brand kit.',
    inputSchema: {
      type: 'object',
      properties: {
        bannedTerms: { type: 'array', items: { type: 'string' } },
        requiredDisclosures: { type: 'array', items: { type: 'string' } },
        factsPack: { type: 'string' },
      },
    },
    execute: (args) => adminGraphql(
      `mutation SaveVoicePack($input: UpsertSocialBrandVoicePackInput!) { upsertSocialBrandVoicePack(input: $input) { id bannedTerms requiredDisclosures factsPack } }`,
      { input: args },
      { allowWrite: true },
    ),
  },
  {
    name: 'social_caption',
    description: 'Generate a Social Studio caption. Charges AI credits.',
    inputSchema: { type: 'object', properties: { prompt: { type: 'string' }, platform: { type: 'string' } }, required: ['prompt'] },
    execute: (args) => adminGraphql(
      `mutation Caption($input: GenerateSocialCaptionInput!) { generateSocialCaption(input: $input) { caption creditsUsed } }`,
      { input: { captionContext: String(args.prompt), platform: args.platform || 'linkedin' } },
      { allowWrite: true },
    ),
  },
];

export const socialTools = RAW_SOCIAL_TOOLS.map(wrapCreditTool);
