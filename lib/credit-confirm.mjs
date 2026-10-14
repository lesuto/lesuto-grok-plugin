import { adminGraphql } from './graphql.mjs';

const PRICING_FIELDS_FULL = `canSpend balance scriptPack scriptRevise characterLook characterLookPackage keyframePerScene videoStandardPerScene videoPremiumPerScene videoCinemaPerScene videoHeroPerScene timelineStitchDraft timelineStitchStandard timelineStitchPremium`;
const PRICING_FIELDS_STANDARD = `canSpend balance scriptPack scriptRevise characterLook characterLookPackage keyframePerScene videoStandardPerScene videoPremiumPerScene videoCinemaPerScene timelineStitchDraft timelineStitchStandard timelineStitchPremium`;

function pricingQuery(fields) {
  return `query StudioCreditQuote { creativeStudioPricing { ${fields} } }`;
}

async function loadStudioPricing() {
  try {
    const data = await adminGraphql(pricingQuery(PRICING_FIELDS_FULL));
    return data.creativeStudioPricing || {};
  } catch (err) {
    const msg = String(err?.message || err || '');
    if (!/Cannot query field|videoHeroPerScene/i.test(msg)) throw err;
    const data = await adminGraphql(pricingQuery(PRICING_FIELDS_STANDARD));
    return data.creativeStudioPricing || {};
  }
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
};

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
  const pricing = await loadStudioPricing();
  const qualityField = creditQuoteField(toolName, args) || spec.field;
  const unit = Number(pricing[spec.field] || 0);
  const fallback = qualityField === 'videoHeroPerScene' ? 450 : unit;
  const chargedUnit = (spec.perScene || spec.multiplier || spec.videoClip || spec.field.startsWith('timelineStitch'))
    ? Number(pricing[qualityField] || fallback)
    : unit;
  const count = spec.perScene && args.sceneId ? 1 : (spec.multiplier || 1);
  const credits = chargedUnit * count;
  const balance = Number(pricing.balance || 0);
  if (args.confirm !== true) {
    const perSceneNote = spec.perScene && !args.sceneId
      ? `${spec.label} is about ${chargedUnit} AI credits per scene (balance ${balance}). Pass sceneId for one beat, or confirm true to continue. Ready stills and clips are free.`
      : `This ${spec.label} will use about ${credits} AI credits (balance ${balance}, about ${Math.max(0, balance - credits)} after). Call again with confirm true after the merchant agrees. Existing script packs and skip-if-ready assets charge 0.`;
    return {
      needsConfirm: true,
      credits,
      unitCredits: chargedUnit,
      perScene: !!spec.perScene && !args.sceneId,
      balance,
      remainingAfter: balance - credits,
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
