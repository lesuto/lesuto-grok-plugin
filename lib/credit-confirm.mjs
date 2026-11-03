import { adminGraphql } from './graphql.mjs';

const PRICING_FIELDS_STANDARD = `canSpend balance scriptPack scriptRevise characterLook characterLookPackage keyframePerScene videoStandardPerScene videoPremiumPerScene videoCinemaPerScene timelineStitchDraft timelineStitchStandard timelineStitchPremium`;
const PRICING_FIELDS_HERO = `${PRICING_FIELDS_STANDARD} videoHeroPerScene`;
/** Captions, drafts, research and voice previews (blogPost from the 2026-11-03 release). */
const PRICING_FIELDS_FULL = `${PRICING_FIELDS_HERO} voicePreview socialCaption draftGrowthLine draftSocialCampaign blogPost`;

function pricingQuery(fields) {
  return `query StudioCreditQuote { creativeStudioPricing { ${fields} } }`;
}

/** The newest price list the server answers; an older server falls back to fewer fields. */
async function loadStudioPricing() {
  const tiers = [PRICING_FIELDS_FULL, PRICING_FIELDS_HERO, PRICING_FIELDS_STANDARD];
  for (let i = 0; i < tiers.length; i++) {
    try {
      const data = await adminGraphql(pricingQuery(tiers[i]));
      return data.creativeStudioPricing || {};
    } catch (err) {
      if (i === tiers.length - 1 || !/Cannot query field/i.test(String(err?.message || err || ''))) throw err;
    }
  }
  return {};
}

export const CREDIT_TOOL_COSTS = {
  studio_scripts_generate: { field: 'scriptPack', label: 'AI script pack' },
  studio_script_revise: { field: 'scriptRevise', label: 'Script revise' },
  studio_script_chat: { field: 'scriptRevise', label: 'Script chat' },
  studio_keyframes: { field: 'keyframePerScene', label: 'Keyframe still', perScene: true },
  studio_keyframe_regenerate: { field: 'keyframePerScene', label: 'Keyframe regenerate' },
  studio_render_scenes: { field: 'videoStandardPerScene', label: 'Scene render', perScene: true },
  studio_render_timeline: { field: 'timelineStitchStandard', label: 'Timeline stitch' },
  studio_stitch_from_script: { field: 'timelineStitchStandard', label: 'Stitch from script' },
  studio_produce_video: { field: 'videoStandardPerScene', label: 'Hands-free video', multiplier: 2 },
  social_generate_image: { field: 'keyframePerScene', label: 'Generate image' },
  social_generate_video: { field: 'videoStandardPerScene', label: 'Generate video', videoClip: true },
  studio_character_looks_propose: { field: 'characterLookPackage', label: 'Look options' },
  studio_character_look_legacy: { field: 'characterLook', label: 'Character look' },
  studio_character_look_package: { field: 'characterLookPackage', label: 'Look package' },
  studio_campaign_generate: { field: 'videoCinemaPerScene', label: 'Campaign generate' },
  studio_campaign_retry_shot: { field: 'keyframePerScene', label: 'Campaign retry' },
  blog_generate: { field: 'blogPost', label: 'AI blog draft', blog: true },
  social_growth_line_draft: { field: 'draftGrowthLine', label: 'Growth Line draft' },
  // Research writes with the blog writer and is charged as a blog post.
  social_growth_line_research: { field: 'blogPost', label: 'Growth Line research' },
  social_campaign_draft: { field: 'draftSocialCampaign', label: 'Campaign draft' },
  social_caption: { field: 'socialCaption', label: 'Caption' },
  studio_voice_preview: { field: 'voicePreview', label: 'Voice preview' },
  studio_tutorial_render: { field: 'videoStandardPerScene', label: 'Tutorial render', perScene: true },
  // No price field on creativeStudioPricing: asks first without a number (its description names the tiers).
  studio_reconstruct_3d: { field: 'reconstruct3d', label: '3D reconstruction' },
};

/**
 * Tools whose descriptions mention credits but spend none (reads, free reuse, drafts), or that
 * run their own quote-and-confirm (social_campaign_arm, social_post_revise). Every other tool
 * that mentions credits must be a credit tool (tools-contract guard).
 */
export const CREDIT_FREE_OR_SELF_QUOTED_TOOLS = new Set([
  'blog_bake_cover', 'org_overview', 'social_campaign_save', 'social_campaign_arm', 'social_post_revise',
  'studio_clip_reuse_options', 'studio_clip_reuse', 'studio_tutorial_plan', 'studio_credits', 'studio_pricing',
  'studio_levels', 'studio_brief_duplicate',
]);

/**
 * Model tier multipliers on a blog draft's standard price, as admin charges them
 * (platform-billing AI_MODEL_TIERS; an admin test keeps the two equal).
 */
export const BLOG_MODEL_TIER_MULTIPLIERS = { standard: 1, pro: 2, elite: 3.5 };

async function loadBlogPricing() {
  try {
    const data = await adminGraphql('query BlogCreditQuote { creativeStudioPricing { canSpend balance blogPost productArticle } }');
    return data.creativeStudioPricing || {};
  } catch (err) {
    // An older server has no blog prices: still ask the merchant, without a number.
    if (!/Cannot query field/i.test(String(err?.message || err || ''))) throw err;
    const data = await adminGraphql('query BlogCreditBalance { creativeStudioPricing { canSpend balance } }');
    return data.creativeStudioPricing || {};
  }
}

/** A blog draft's price: the product article price when products are linked, times the model tier. */
export function blogDraftCredits(pricing, args = {}) {
  const base = Number((Array.isArray(args.linkedProductIds) && args.linkedProductIds.length ? pricing.productArticle : pricing.blogPost) || 0);
  if (!(base > 0)) return null;
  const tier = String(args.modelTier || 'standard').toLowerCase();
  return Math.ceil(base * (BLOG_MODEL_TIER_MULTIPLIERS[tier] ?? 1));
}

/** An older server that does not price this action: still ask the merchant, without a number. */
async function quoteWithoutPrice(spec, args, pricing, run) {
  const balance = Number(pricing.balance || 0);
  if (args.confirm !== true) {
    return {
      needsConfirm: true,
      credits: null,
      balance,
      remainingAfter: null,
      canSpend: pricing.canSpend !== false,
      message: `This ${spec.label} uses AI credits (balance ${balance}). Call again with confirm true after the merchant agrees.`,
    };
  }
  const result = await run();
  return { result, creditsQuoted: null, balanceBefore: balance, note: 'Final debit is on the mutation receipt.' };
}

async function requireBlogConfirm(spec, args, run) {
  const pricing = await loadBlogPricing();
  const credits = blogDraftCredits(pricing, args);
  const balance = Number(pricing.balance || 0);
  if (args.confirm !== true) {
    return {
      needsConfirm: true,
      credits,
      balance,
      remainingAfter: credits == null ? null : balance - credits,
      canSpend: pricing.canSpend !== false,
      message: credits == null
        ? `This ${spec.label} uses AI credits (balance ${balance}). Call again with confirm true after the merchant agrees.`
        : `This ${spec.label} will use about ${credits} AI credits (balance ${balance}, about ${Math.max(0, balance - (credits ?? 0))} after). Call again with confirm true after the merchant agrees.`,
    };
  }
  const result = await run();
  return { result, creditsQuoted: credits, balanceBefore: balance, note: 'Final debit is on the mutation receipt.' };
}

export function isCreditTool(name) {
  return Object.prototype.hasOwnProperty.call(CREDIT_TOOL_COSTS, name);
}

export function creditQuoteField(toolName, args = {}) {
  const spec = CREDIT_TOOL_COSTS[toolName];
  if (!spec) return null;
  if (spec.field.startsWith('timelineStitch')) {
    const tier = String(args.qualityTier || args.quality || '').toLowerCase();
    if (tier === 'draft') return 'timelineStitchDraft';
    if (tier === 'premium' || tier === 'cinema' || tier === 'hero') return 'timelineStitchPremium';
    return 'timelineStitchStandard';
  }
  const quality = String(args.quality || '').toLowerCase();
  const engine = String(args.engine || '').toLowerCase();
  const nativeAudio = spec.videoClip && args.includeAudio === true;
  if (quality === 'hero' || engine === 'hero') return 'videoHeroPerScene';
  if (quality === 'cinema' || engine === 'cinema' || engine === 'veo' || nativeAudio) return 'videoCinemaPerScene';
  if (quality === 'premium' || engine === 'kling') return 'videoPremiumPerScene';
  return spec.field;
}

export function wrapCreditTool(tool) {
  if (!isCreditTool(tool.name)) return tool;
  const execute = tool.execute;
  return {
    ...tool,
    description: `${tool.description} Quote AI credits first. Call again with confirm true after the merchant agrees.`,
    inputSchema: {
      ...tool.inputSchema,
      properties: {
        ...(tool.inputSchema?.properties || {}),
        confirm: { type: 'boolean', description: 'Required after the credit quote. Agents cannot buy credits.' },
      },
    },
    execute: (args) => requireCreditConfirm(tool.name, args || {}, () => execute(args)),
  };
}

export async function requireCreditConfirm(toolName, args, run) {
  const spec = CREDIT_TOOL_COSTS[toolName];
  if (!spec) return run();
  if (spec.blog) return requireBlogConfirm(spec, args, run);
  const pricing = await loadStudioPricing();
  if (pricing[spec.field] === undefined) return quoteWithoutPrice(spec, args, pricing, run);
  const qualityField = creditQuoteField(toolName, args) || spec.field;
  const unit = Number(pricing[spec.field] || 0);
  const fallback = qualityField === 'videoHeroPerScene' ? 450 : unit;
  const chargedUnit = (spec.perScene || spec.multiplier || spec.videoClip || spec.field.startsWith('timelineStitch'))
    ? Number(pricing[qualityField] || fallback)
    : unit;
  const count = spec.perScene && args.sceneId ? 1 : (spec.multiplier || 1);
  // Per scene with no scene named: the total depends on how many scenes, so there is no total to
  // quote (one scene's price as `credits` read as the whole bill).
  const unknownTotal = !!spec.perScene && !args.sceneId;
  const credits = unknownTotal ? null : chargedUnit * count;
  const balance = Number(pricing.balance || 0);
  if (args.confirm !== true) {
    const perSceneNote = spec.perScene && !args.sceneId
      ? `${spec.label} is about ${chargedUnit} AI credits per scene (balance ${balance}). Pass sceneId for one beat, or confirm true to continue. Ready stills and clips are free.`
      : `This ${spec.label} will use about ${credits} AI credits (balance ${balance}, about ${Math.max(0, balance - credits)} after). Call again with confirm true after the merchant agrees. Existing script packs and skip-if-ready assets charge 0.`;
    return {
      needsConfirm: true,
      credits,
      unitCredits: chargedUnit,
      perScene: unknownTotal,
      balance,
      remainingAfter: credits == null ? null : balance - credits,
      canSpend: pricing.canSpend !== false,
      message: perSceneNote,
    };
  }
  const result = await run();
  return {
    result,
    creditsQuoted: credits,
    balanceBefore: balance,
    note: 'Final debit is on the mutation receipt. Skip-if-ready stills, clips, and existing script packs charge 0.',
  };
}
