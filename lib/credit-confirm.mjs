import { adminGraphql } from './graphql.mjs';

const PRICING_QUERY = `query StudioCreditQuote {
  creativeStudioPricing {
    canSpend
    balance
    scriptPack
    scriptRevise
    characterLook
    characterLookPackage
    keyframePerScene
    videoStandardPerScene
    videoPremiumPerScene
    videoCinemaPerScene
    timelineStitchStandard
  }
}`;

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
  social_generate_video: { field: 'videoStandardPerScene', label: 'Generate video' },
  studio_character_looks_propose: { field: 'characterLookPackage', label: 'Look options' },
  studio_character_look_legacy: { field: 'characterLook', label: 'Character look' },
  studio_character_look_package: { field: 'characterLookPackage', label: 'Look package' },
  studio_campaign_generate: { field: 'videoCinemaPerScene', label: 'Campaign generate' },
  studio_campaign_retry_shot: { field: 'keyframePerScene', label: 'Campaign retry' },
};

export function isCreditTool(name) {
  return Object.prototype.hasOwnProperty.call(CREDIT_TOOL_COSTS, name);
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
  const data = await adminGraphql(PRICING_QUERY);
  const pricing = data.creativeStudioPricing || {};
  const unit = Number(pricing[spec.field] || 0);
  const quality = String(args.quality || args.engine || '').toLowerCase();
  const qualityField = quality === 'hero' || quality === 'cinema'
    ? 'videoCinemaPerScene'
    : quality === 'premium' || quality === 'kling'
      ? 'videoPremiumPerScene'
      : spec.field;
  const chargedUnit = spec.perScene || spec.multiplier
    ? Number(pricing[qualityField] || unit)
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
