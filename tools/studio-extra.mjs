/**
 * Remaining Social Studio operator ops that are not on the main stepwise path.
 * Grok still only calls api.lesuto.com. Keep this file for parity coverage.
 */
import { adminGraphql } from '../lib/graphql.mjs';
import { wrapCreditTool } from '../lib/credit-confirm.mjs';

const SCRIPT_FIELDS = `id title body hookLine ctaLine endCard { lines durationSeconds } status`;
const CHARACTER_FIELDS = `id name archetype description voiceConfig`;

function gql(query, variables, write = false) {
  return adminGraphql(query, variables, write ? { allowWrite: true } : undefined);
}

const RAW_STUDIO_EXTRA_TOOLS = [
  {
    name: 'studio_credits',
    description: 'Read AI media credit balance for this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { aiMediaCreditBalance }`),
  },
  {
    name: 'studio_briefs',
    description: 'List Creative Studio briefs for this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeBriefs { id status answers } }`),
  },
  {
    name: 'studio_scripts',
    description: 'List scripts for a brief.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' } }, required: ['briefId'] },
    execute: (args) => gql(
      `query Scripts($briefId: ID!) { creativeScripts(briefId: $briefId) { ${SCRIPT_FIELDS} } }`,
      { briefId: String(args.briefId) },
    ),
  },
  {
    name: 'studio_voice_preview_status',
    description: 'ElevenLabs preview billing status. Unpaid accounts return a reason, not an empty picker.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeVoicePreviewStatus { available providerStatus providerReason } }`),
  },
  {
    name: 'studio_pricing',
    description: 'Creative Studio credit prices for scripts, stills, and renders. scriptRevise is the cheap polish cost.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeStudioPricing { canSpend balance scriptPack scriptRevise characterLook characterLookPackage keyframePerScene videoStandardPerScene videoPremiumPerScene videoCinemaPerScene timelineStitchStandard } }`),
  },
  {
    name: 'studio_levels',
    description: 'Creative level options and estimated credits.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeLevels { id label hint estimatedCredits videoEngine } }`),
  },
  {
    name: 'studio_voice_cloning_status',
    description: 'Channel voice cloning entitlement. Cloning stays human-only; this is status only.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { channelVoiceCloningStatus { available professionalAvailable } }`),
  },
  {
    name: 'studio_character_research',
    description: 'Cited research suggestions and saved notes for a character.',
    inputSchema: { type: 'object', properties: { characterId: { type: 'string' } }, required: ['characterId'] },
    execute: (args) => gql(
      `query Research($characterId: ID!) {
        characterResearchSuggestions(characterId: $characterId) { title url summary }
        characterResearchNotes(characterId: $characterId) { id title url }
      }`,
      { characterId: String(args.characterId) },
    ),
  },
  {
    name: 'studio_character_research_save',
    description: 'Save an approved cited research note for a character.',
    inputSchema: {
      type: 'object',
      properties: { characterId: { type: 'string' }, title: { type: 'string' }, url: { type: 'string' } },
      required: ['characterId', 'title', 'url'],
    },
    execute: (args) => gql(
      `mutation SaveNote($input: SaveCharacterResearchNoteInput!) { saveCharacterResearchNote(input: $input) { id title } }`,
      { input: { characterId: String(args.characterId), title: String(args.title), url: String(args.url) } },
      true,
    ),
  },
  {
    name: 'studio_brief_duplicate',
    description: 'Duplicate a brief and copy the locked script template at 0 credits. Stills are not copied.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' } }, required: ['briefId'] },
    execute: (args) => gql(
      `mutation DupBrief($briefId: ID!) { duplicateCreativeBrief(briefId: $briefId) { id status answers completeness { complete missing } } }`,
      { briefId: String(args.briefId) },
      true,
    ),
  },
  {
    name: 'studio_brief_unlock',
    description: 'Unlock a brief so answers can change again.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' } }, required: ['briefId'] },
    execute: (args) => gql(
      `mutation UnlockBrief($briefId: ID!) { unlockCreativeBrief(briefId: $briefId) { id status } }`,
      { briefId: String(args.briefId) },
      true,
    ),
  },
  {
    name: 'studio_brief_archive',
    description: 'Archive a Creative Studio brief.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' } }, required: ['briefId'] },
    execute: (args) => gql(
      `mutation ArchiveBrief($briefId: ID!) { archiveCreativeBrief(briefId: $briefId) { id status } }`,
      { briefId: String(args.briefId) },
      true,
    ),
  },
  {
    name: 'studio_script_revise',
    description: 'AI polish one script. Charges script credits.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, instruction: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation Revise($id: ID!, $instruction: String) { reviseCreativeScript(id: $id, instruction: $instruction) { ${SCRIPT_FIELDS} } }`,
      { id: String(args.id), instruction: args.instruction || null },
      true,
    ),
  },
  {
    name: 'studio_script_chat',
    description: 'Multi-turn AI chat revise for one script. Charges script credits per turn.',
    inputSchema: {
      type: 'object',
      properties: { scriptId: { type: 'string' }, content: { type: 'string' } },
      required: ['scriptId', 'content'],
    },
    execute: (args) => gql(
      `mutation ChatRevise($scriptId: ID!, $messages: [CreativeChatMessageInput!]!) { chatReviseCreativeScript(scriptId: $scriptId, messages: $messages) { ${SCRIPT_FIELDS} assistantMessage } }`,
      { scriptId: String(args.scriptId), messages: [{ role: 'user', content: String(args.content) }] },
      true,
    ),
  },
  {
    name: 'studio_character_look_legacy',
    description: 'Legacy one-shot look lock. Prefer studio_character_looks_propose then commit.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, visualStyle: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation LegacyLook($id: ID!, $visualStyle: String) { generateCreativeCharacterLook(id: $id, termsAcknowledged: true, visualStyle: $visualStyle) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id), visualStyle: args.visualStyle || null },
      true,
    ),
  },
  {
    name: 'studio_character_video_seed',
    description: 'Set a character video seed for a visual style.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, seed: { type: 'string' }, visualStyle: { type: 'string' } },
      required: ['id', 'seed', 'visualStyle'],
    },
    execute: (args) => gql(
      `mutation SetSeed($id: ID!, $seed: String!, $visualStyle: String!) { setCreativeCharacterVideoSeed(id: $id, seed: $seed, visualStyle: $visualStyle) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id), seed: String(args.seed), visualStyle: String(args.visualStyle) },
      true,
    ),
  },
  {
    name: 'studio_character_primary_style',
    description: 'Set the primary look style on a character.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, visualStyle: { type: 'string' } },
      required: ['id', 'visualStyle'],
    },
    execute: (args) => gql(
      `mutation PrimaryStyle($id: ID!, $visualStyle: String!) { setCreativeCharacterPrimaryLookStyle(id: $id, visualStyle: $visualStyle) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id), visualStyle: String(args.visualStyle) },
      true,
    ),
  },
  {
    name: 'studio_campaign_generate',
    description: 'Generate a Creative Studio campaign set for a product. Charges campaign credits.',
    inputSchema: { type: 'object', properties: { productId: { type: 'string' }, level: { type: 'string' } }, required: ['productId'] },
    execute: (args) => gql(
      `mutation GenCampaign($input: GenerateCreativeCampaignInput!) { generateCreativeCampaign(input: $input) { productId level estimatedCredits creditsUsed } }`,
      { input: { productId: String(args.productId), level: args.level || null } },
      true,
    ),
  },
  {
    name: 'studio_campaign_retry_shot',
    description: 'Retry one Creative Studio campaign shot.',
    inputSchema: {
      type: 'object',
      properties: { productId: { type: 'string' }, shotId: { type: 'string' }, level: { type: 'string' } },
      required: ['productId', 'shotId'],
    },
    execute: (args) => gql(
      `mutation RetryShot($input: RetryCreativeCampaignShotInput!) { retryCreativeCampaignShot(input: $input) { shotId kind preview } }`,
      { input: { productId: String(args.productId), shotId: String(args.shotId), level: args.level || null } },
      true,
    ),
  },
  {
    name: 'studio_campaign_approve_asset',
    description: 'Approve a Creative Studio campaign asset.',
    inputSchema: { type: 'object', properties: { assetId: { type: 'string' } }, required: ['assetId'] },
    execute: (args) => gql(
      `mutation ApproveAsset($assetId: ID!) { approveCreativeCampaignAsset(assetId: $assetId) { shotId approved } }`,
      { assetId: String(args.assetId) },
      true,
    ),
  },
];

export const studioExtraTools = RAW_STUDIO_EXTRA_TOOLS.map(wrapCreditTool);
