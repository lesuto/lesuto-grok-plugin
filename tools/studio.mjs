/**
 * Stepwise Creative Studio tools. Grok only calls api.lesuto.com Admin GraphQL.
 * ElevenLabs stays inside chameleon-admin. Prefer these over studio_produce_video
 * when the merchant wrote the script or picked a voice.
 */
import { adminGraphql } from '../lib/graphql.mjs';
import { graphqlWithSceneFieldTiers } from '../lib/scene-field-tiers.mjs';
import { wrapCreditTool } from '../lib/credit-confirm.mjs';
import { orderScenesForStitch } from '../lib/studio-clips.mjs';

const SCENE_FIELDS = `id order label subject action cameraMove lighting durationSeconds isOpeningHook voiceover onScreenText status stillMode productId errorMessage keyframeAssetId keyframePreviewUrl endKeyframeAssetId endKeyframePreviewUrl renderedAssetId renderedPreviewUrl`;
const SCRIPT_FIELDS = `id briefId title body hookLine ctaLine endCard { lines durationSeconds } rankScore variantIndex status complianceFlags aiGenerated beats { order label voiceover onScreenText visual durationSeconds }`;
const CHARACTER_FIELDS = `id name archetype description voiceNotes voiceConfig isPreset storeId primaryReferenceUrl`;
const BRIEF_FIELDS = `id status mode answers completeness { complete missing }`;

function gql(query, variables, write = false) {
  return graphqlWithSceneFieldTiers(
    adminGraphql,
    query,
    variables,
    write ? { allowWrite: true } : undefined,
  );
}

const LOOK_PROPOSAL_FIELDS = `characterId visualStyle primaryShotType currentPreviewUrl currentAssetId creditsCharged candidates { assetId previewUrl }`;
const LOOK_STILL_FIELDS = `shotType assetId previewUrl`;

/** Numbered HTTPS photos so Grok can show look options instead of raw JSON. */
export function formatLookProposal(proposal) {
  const candidates = Array.isArray(proposal?.candidates) ? proposal.candidates : [];
  const looks = candidates.map((c, i) => {
    const n = i + 1;
    const previewUrl = String(c?.previewUrl || '');
    return {
      option: n,
      assetId: Number(c?.assetId) || null,
      previewUrl,
      markdown: previewUrl ? `![Look ${n}](${previewUrl})` : '',
    };
  });
  const creditsCharged = Number(proposal?.creditsCharged) || 0;
  const perStill = looks.length ? Math.round(creditsCharged / looks.length) : 0;
  const lines = [
    `Look options for character ${proposal?.characterId ?? ''}${proposal?.visualStyle ? ` (${proposal.visualStyle})` : ''}.`,
    `AI credits charged: ${creditsCharged}${perStill ? ` (${perStill} per still)` : ''}. Agent writes also use integration credits.`,
    'Show every photo. Ask which look to keep, then call studio_character_look_commit with that assetId and previewUrl.',
    '',
    ...looks.flatMap((look) => [
      `${look.option}. assetId ${look.assetId}`,
      look.previewUrl,
      look.markdown,
    ]),
  ];
  if (proposal?.currentPreviewUrl) {
    lines.push('', `Current locked look: ${proposal.currentPreviewUrl}`);
  }
  return {
    characterId: proposal?.characterId ?? null,
    visualStyle: proposal?.visualStyle || null,
    creditsCharged,
    pickInstruction: 'Show every previewUrl as a numbered photo. Ask which look to keep, then studio_character_look_commit.',
    looks,
    currentPreviewUrl: proposal?.currentPreviewUrl || null,
    currentAssetId: proposal?.currentAssetId ?? null,
    message: lines.filter((line) => line !== undefined).join('\n'),
  };
}

export function formatLookStills(stills) {
  const rows = Array.isArray(stills) ? stills : [];
  const looks = rows
    .filter((s) => s?.previewUrl || s?.assetId)
    .map((s, i) => {
      const n = i + 1;
      const previewUrl = String(s.previewUrl || '');
      const shotType = s.shotType || `look-${n}`;
      return {
        option: n,
        shotType,
        assetId: s.assetId ?? null,
        previewUrl,
        markdown: previewUrl ? `![${shotType}](${previewUrl})` : '',
      };
    });
  return {
    looks,
    message: [
      'Locked look stills. Show every photo.',
      ...looks.flatMap((look) => [
        `${look.option}. ${look.shotType} assetId ${look.assetId}`,
        look.previewUrl,
        look.markdown,
      ]),
    ].filter(Boolean).join('\n'),
  };
}

const RAW_STUDIO_TOOLS = [
  {
    name: 'studio_brief_catalog',
    description: 'List Creative Studio brief questions, categories, styles, durations, and platforms.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeBriefCatalog { questions { id field prompt help input options { value label hint allowsCustom } } } }`),
  },
  {
    name: 'studio_brief_upsert',
    description: 'Create or update a Creative Studio brief. answers is the same JSON the admin form writes (category, aspectRatio auto/16:9/9:16, productId, characterId, useCatalogPhotoAsStartFrame, qualityTier).',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: { type: 'string' },
        storeId: { type: 'number' },
        mode: { type: 'string' },
        answers: { type: 'object' },
      },
    },
    execute: (args) => gql(
      `mutation UpsertBrief($input: UpsertCreativeBriefInput!) { upsertCreativeBrief(input: $input) { ${BRIEF_FIELDS} } }`,
      { input: { briefId: args.briefId || undefined, storeId: args.storeId ?? null, mode: args.mode || 'manual', answers: args.answers || {} } },
      true,
    ),
  },
  {
    name: 'studio_brief_lock',
    description: 'Lock a brief after the merchant accepts the AI Generated Media License (version 2.0). Auto aspect resolves here.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' }, rightsAckVersion: { type: 'string' } }, required: ['briefId'] },
    execute: (args) => gql(
      `mutation LockBrief($briefId: ID!, $rightsAckVersion: String) { lockCreativeBrief(briefId: $briefId, rightsAckVersion: $rightsAckVersion) { ${BRIEF_FIELDS} } }`,
      { briefId: String(args.briefId), rightsAckVersion: args.rightsAckVersion || '2.0' },
      true,
    ),
  },
  {
    name: 'studio_brief_answer',
    description: 'Answer one conversational brief question.',
    inputSchema: {
      type: 'object',
      properties: { briefId: { type: 'string' }, field: { type: 'string' }, value: {}, displayText: { type: 'string' } },
      required: ['briefId', 'field'],
    },
    execute: (args) => gql(
      `mutation AnswerBrief($input: AnswerCreativeBriefInput!) { answerCreativeBriefQuestion(input: $input) { brief { ${BRIEF_FIELDS} } nextQuestion { id field prompt } completeness { complete missing } } }`,
      { input: { briefId: String(args.briefId), field: String(args.field), value: args.value, displayText: args.displayText || null } },
      true,
    ),
  },
  {
    name: 'studio_script_from_draft',
    description: 'Paste the merchant script. Creates a brief from the draft, then a handwritten script. Use this when they wrote the words.',
    inputSchema: {
      type: 'object',
      properties: {
        briefId: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        storeId: { type: 'number' },
        characterId: { type: 'string' },
        hookLine: { type: 'string' },
        ctaLine: { type: 'string' },
      },
      required: ['title', 'body'],
    },
    execute: async (args) => {
      const briefRes = await gql(
        `mutation FromDraft($input: CreateBriefFromScriptDraftInput!) { createBriefFromScriptDraft(input: $input) { ${BRIEF_FIELDS} } }`,
        { input: { briefId: args.briefId || null, title: String(args.title), body: String(args.body), storeId: args.storeId ?? null, characterId: args.characterId || null } },
        true,
      );
      const briefId = briefRes?.createBriefFromScriptDraft?.id;
      if (!briefId) return briefRes;
      const scriptRes = await gql(
        `mutation ManualScript($briefId: ID!, $input: CreateManualCreativeScriptInput!) { createManualCreativeScript(briefId: $briefId, input: $input) { ${SCRIPT_FIELDS} } }`,
        { briefId, input: { title: String(args.title), body: String(args.body), hookLine: args.hookLine || null, ctaLine: args.ctaLine || null } },
        true,
      );
      return { brief: briefRes.createBriefFromScriptDraft, script: scriptRes.createManualCreativeScript };
    },
  },
  {
    name: 'studio_scripts_generate',
    description: 'One AI script pack (3-4 variants) for a locked brief. Idempotent if a pack exists. Pass force true to regenerate.',
    inputSchema: {
      type: 'object',
      properties: { briefId: { type: 'string' }, force: { type: 'boolean' } },
      required: ['briefId'],
    },
    execute: (args) => gql(
      `mutation GenScripts($briefId: ID!, $force: Boolean) { generateCreativeScripts(briefId: $briefId, force: $force) { ${SCRIPT_FIELDS} } }`,
      { briefId: String(args.briefId), force: args.force === true },
      true,
    ),
  },
  {
    name: 'studio_script_update',
    description: 'Edit script words, beats, and end-card lines.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        title: { type: 'string' },
        body: { type: 'string' },
        hookLine: { type: 'string' },
        ctaLine: { type: 'string' },
        beats: { type: 'array' },
        endCard: { type: 'object' },
      },
      required: ['id'],
    },
    execute: (args) => gql(
      `mutation UpdateScript($id: ID!, $input: UpdateCreativeScriptInput!) { updateCreativeScript(id: $id, input: $input) { ${SCRIPT_FIELDS} } }`,
      {
        id: String(args.id),
        input: {
          title: args.title,
          body: args.body,
          hookLine: args.hookLine,
          ctaLine: args.ctaLine,
          beats: args.beats,
          endCard: args.endCard,
        },
      },
      true,
    ),
  },
  {
    name: 'studio_script_select',
    description: 'Select the script that will become scenes.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation SelectScript($id: ID!) { selectCreativeScript(id: $id) { ${SCRIPT_FIELDS} } }`,
      { id: String(args.id) },
      true,
    ),
  },
  {
    name: 'studio_still_modes',
    description: 'Still contract for product-linked scenes. listing_orbit = listing photos as the frame. lifestyle / talent_restage / product_reference = generate people, wardrobe, action, and lighting from scene text; listing photos are SKU reference only. establishing / no_product = no SKU in frame. end_card = overlay copy. Set stillMode on studio_scene_update, then enqueue stills.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => ({
      modes: [
        { stillMode: 'listing_orbit', aliases: ['listing'], use: 'Paste listing photos as start and end frames. Charge 0.' },
        { stillMode: 'lifestyle', aliases: ['talent_restage', 'product_reference'], use: 'Generate the scene as written (people, wardrobe, action, lighting). Listing photos are a weak SKU hint only.' },
        { stillMode: 'establishing', aliases: ['no_product'], use: 'No SKU in frame. Villa driveway, sky, B-roll.' },
        { stillMode: 'end_card', aliases: [], use: 'Overlay copy at stitch. Do not generate a product still.' },
      ],
      enqueue: 'studio_keyframes and studio_keyframe_regenerate return a jobId. Poll studio_job_status. Never call generateCreativeKeyframes.',
    }),
  },
  {
    name: 'studio_scenes_build',
    description: 'Build the shot list from the selected script. Each scene gets stillMode (listing_orbit, lifestyle, establishing, end_card). Confirm or set stillMode with studio_scene_update before keyframes.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } }, required: ['scriptId'] },
    execute: (args) => gql(
      `mutation BuildScenes($scriptId: ID!) { buildCreativeScenes(scriptId: $scriptId) { ${SCENE_FIELDS} } }`,
      { scriptId: String(args.scriptId) },
      true,
    ),
  },
  {
    name: 'studio_scene_update',
    description: 'Edit one scene: stillMode, action, cameraMove, lighting, voiceover, onScreenText, listing start/end asset ids, duration, productId. stillMode is the still contract: listing_orbit (listing photos), lifestyle (talent restage / product reference: generate people and lighting from scene text, listing photos as SKU hint only), establishing (no product), end_card. Aliases: talent_restage, product_reference, no_product. Changing stillMode clears stills. Do not assign listing photos as keyframes on lifestyle or establishing. On-screen text is burned on at stitch, not painted by the motion model.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        action: { type: 'string' },
        cameraMove: { type: 'string' },
        lighting: { type: 'string' },
        durationSeconds: { type: 'number' },
        voiceover: { type: 'string' },
        onScreenText: { type: 'string' },
        keyframeAssetId: { type: 'number' },
        endKeyframeAssetId: { type: 'number' },
        label: { type: 'string' },
        subject: { type: 'string' },
        stillMode: { type: 'string', enum: ['listing_orbit', 'lifestyle', 'establishing', 'end_card', 'talent_restage', 'product_reference', 'no_product'] },
        productId: { type: 'number' },
      },
      required: ['id'],
    },
    execute: (args) => gql(
      `mutation UpdateScene($id: ID!, $input: UpdateCreativeSceneInput!) { updateCreativeScene(id: $id, input: $input) { ${SCENE_FIELDS} } }`,
      {
        id: String(args.id),
        input: {
          label: args.label,
          subject: args.subject,
          action: args.action,
          cameraMove: args.cameraMove,
          lighting: args.lighting,
          durationSeconds: args.durationSeconds,
          voiceover: args.voiceover,
          onScreenText: args.onScreenText,
          keyframeAssetId: args.keyframeAssetId ?? undefined,
          endKeyframeAssetId: args.endKeyframeAssetId ?? undefined,
          stillMode: args.stillMode || undefined,
          productId: args.productId ?? undefined,
        },
      },
      true,
    ),
  },
  {
    name: 'studio_scenes_reorder',
    description: 'Swap storyboard order. Pass every scene id for the script once. First id plays first. The Hook badge stays on the original hook scene. Then stitch with studio_stitch_from_script sceneIds in the same order.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string' },
        sceneIds: { type: 'array', items: { type: 'string' } },
      },
      required: ['scriptId', 'sceneIds'],
    },
    execute: (args) => gql(
      `mutation ReorderScenes($scriptId: ID!, $sceneIds: [ID!]!) { reorderCreativeScenes(scriptId: $scriptId, sceneIds: $sceneIds) { ${SCENE_FIELDS} } }`,
      { scriptId: String(args.scriptId), sceneIds: (args.sceneIds || []).map(String) },
      true,
    ),
  },
  {
    name: 'studio_scenes',
    description: 'List scenes with keyframe and clip preview URLs.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } }, required: ['scriptId'] },
    execute: (args) => gql(
      `query Scenes($scriptId: ID!) { creativeScriptScenes(scriptId: $scriptId) { ${SCENE_FIELDS} } }`,
      { scriptId: String(args.scriptId) },
    ),
  },
  {
    name: 'studio_catalog_angles',
    description: 'List listing photos for a product. Assign consecutive angles as keyframeAssetId and endKeyframeAssetId on studio_scene_update so motion stays on the SKU. 3D is a separate optional GLB, not required for this.',
    inputSchema: { type: 'object', properties: { productId: { type: 'string' } }, required: ['productId'] },
    execute: (args) => gql(
      `query CatalogAngles($productId: ID!) { creativeCatalogAngles(productId: $productId) { assetId previewUrl } }`,
      { productId: String(args.productId) },
    ),
  },
  {
    name: 'studio_scene_quality',
    description: 'Quality scores for a script storyboard.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } }, required: ['scriptId'] },
    execute: (args) => gql(
      `query SceneQuality($scriptId: ID!) { creativeSceneQuality(scriptId: $scriptId) { sceneId pass score reasons } }`,
      { scriptId: String(args.scriptId) },
    ),
  },
  {
    name: 'studio_keyframes',
    description: 'Enqueue stills and return jobId. Pass sceneId and which=start|end for one beat. Poll studio_job_status. Listing-orbit reuses catalog photos (0 credits). lifestyle/establishing generate from the full scene text (about 12 AI credits); listing photos are SKU reference only. which=end always generates or returns an error. Read errorMessage on a failed scene. Use the merchant store (L1). JPEG/PNG stills only.',
    inputSchema: {
      type: 'object',
      properties: { scriptId: { type: 'string' }, sceneId: { type: 'string' }, which: { type: 'string' }, force: { type: 'boolean' } },
      required: ['scriptId'],
    },
    execute: (args) => gql(
      `mutation EnqueueKeyframes($scriptId: ID!, $sceneId: ID, $which: String, $force: Boolean) { enqueueCreativeKeyframes(scriptId: $scriptId, sceneId: $sceneId, which: $which, force: $force) { jobId estimatedMs } }`,
      {
        scriptId: String(args.scriptId),
        sceneId: args.sceneId ? String(args.sceneId) : null,
        which: args.which || null,
        force: args.force === true,
      },
      true,
    ),
  },
  {
    name: 'studio_keyframe_regenerate',
    description: 'Enqueue a forced start or end still for one scene. Poll studio_job_status for jobId. Set stillMode first (lifestyle or establishing) when a listing photo was pasted onto a people or setting beat. About 12 AI credits when a new image is generated. listing_orbit reuse charges 0. which=start|end.',
    inputSchema: {
      type: 'object',
      properties: { scriptId: { type: 'string' }, sceneId: { type: 'string' }, which: { type: 'string' } },
      required: ['scriptId', 'sceneId', 'which'],
    },
    execute: (args) => gql(
      `mutation EnqueueKeyframes($scriptId: ID!, $sceneId: ID, $which: String, $force: Boolean) { enqueueCreativeKeyframes(scriptId: $scriptId, sceneId: $sceneId, which: $which, force: $force) { jobId estimatedMs } }`,
      { scriptId: String(args.scriptId), sceneId: String(args.sceneId), which: String(args.which), force: true },
      true,
    ),
  },
  {
    name: 'studio_render_scenes',
    description: 'Enqueue motion from approved start and end stills. Pass sceneId for one clip. Without sceneId this charges every scene. Poll studio_job_status for an MP4 (never .mp4.png). quality=standard|hero. engine=luma is the cheap 5s path; cinema/hero is 1080p Veo. Ready clips are free. Use the merchant store (L1), not the supplier channel. Letters burn on at stitch, not in this clip.',
    inputSchema: {
      type: 'object',
      properties: { scriptId: { type: 'string' }, sceneId: { type: 'string' }, engine: { type: 'string' }, quality: { type: 'string' }, force: { type: 'boolean' } },
      required: ['scriptId'],
    },
    execute: (args) => gql(
      `mutation EnqueueRenders($scriptId: ID!, $sceneId: ID, $engine: String, $force: Boolean, $quality: String) { enqueueCreativeSceneRenders(scriptId: $scriptId, sceneId: $sceneId, engine: $engine, force: $force, quality: $quality) { jobId estimatedMs } }`,
      {
        scriptId: String(args.scriptId),
        sceneId: args.sceneId ? String(args.sceneId) : null,
        engine: args.engine || null,
        force: args.force === true,
        quality: args.quality || null,
      },
      true,
    ),
  },
  {
    name: 'studio_render_storyboard',
    description: 'Cheap slideshow MP4 of keyframes for approval before motion.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } }, required: ['scriptId'] },
    execute: (args) => gql(
      `mutation Storyboard($scriptId: ID!) { renderCreativeStoryboard(scriptId: $scriptId) { id status outputUrl progress errorMessage creditsUsed } }`,
      { scriptId: String(args.scriptId) },
      true,
    ),
  },
  {
    name: 'studio_render_timeline',
    description: 'Stitch rendered clips with overlays, end card, optional VO, and licensed music. Returns an export to poll.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string' },
        clips: { type: 'array' },
        qualityTier: { type: 'string' },
        canvasMode: { type: 'string' },
        includeVoiceover: { type: 'boolean' },
        burnOverlays: { type: 'boolean' },
        musicAssetId: { type: 'number' },
      },
      required: ['scriptId', 'clips'],
    },
    execute: (args) => gql(
      `mutation Timeline($scriptId: ID!, $input: CreativeTimelineInput!) { renderCreativeTimeline(scriptId: $scriptId, input: $input) { id status outputUrl progress errorMessage creditsUsed } }`,
      {
        scriptId: String(args.scriptId),
        input: {
          clips: args.clips,
          qualityTier: args.qualityTier || 'standard',
          canvasMode: args.canvasMode || null,
          includeVoiceover: args.includeVoiceover === true,
          burnOverlays: args.burnOverlays !== false,
          musicAssetId: args.musicAssetId || null,
        },
      },
      true,
    ),
  },
  {
    name: 'studio_export_status',
    description: 'Poll timeline exports. Read outputUrl when status is completed and the URL is an MP4. Ignore .mp4.png posters. Show errorMessage as written.',
    inputSchema: { type: 'object', properties: { scriptId: { type: 'string' } }, required: ['scriptId'] },
    execute: (args) => gql(
      `query Exports($scriptId: ID!) { creativeTimelineExports(scriptId: $scriptId) { id status outputUrl progressStage progress errorMessage creditsUsed } }`,
      { scriptId: String(args.scriptId) },
    ),
  },
  {
    name: 'studio_characters',
    description: 'List Creative Studio characters for this channel.',
    inputSchema: { type: 'object', properties: { storeId: { type: 'number' } } },
    execute: (args) => gql(
      `query Characters($storeId: Int) { creativeCharacters(storeId: $storeId) { ${CHARACTER_FIELDS} } }`,
      { storeId: args.storeId ?? null },
    ),
  },
  {
    name: 'studio_character_save',
    description: 'Create or update an adult on-camera character. Not a clone of a real person.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        archetype: { type: 'string' },
        voiceNotes: { type: 'string' },
        storeId: { type: 'number' },
      },
      required: ['name', 'description'],
    },
    execute: (args) => gql(
      `mutation SaveCharacter($input: UpsertCreativeCharacterInput!) { upsertCreativeCharacter(input: $input) { ${CHARACTER_FIELDS} } }`,
      { input: { id: args.id || undefined, name: String(args.name), description: String(args.description), archetype: args.archetype || 'presenter', voiceNotes: args.voiceNotes || null, storeId: args.storeId ?? null } },
      true,
    ),
  },
  {
    name: 'studio_character_looks_propose',
    description: 'Generate two look stills (12 AI credits each, 24 for the pair). Returns numbered HTTPS preview URLs and markdown photos. Show every photo, then wait for the merchant to pick one before studio_character_look_commit.',
    inputSchema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        visualStyle: { type: 'string', description: 'realistic, cartoon, or anime. Omit to use the character default.' },
        shotType: { type: 'string', description: 'portrait, full_body, or turnaround. Omit to use the character default.' },
        force: { type: 'boolean', description: 'Generate new options when this style already has a locked look.' },
      },
      required: ['id'],
    },
    execute: async (args) => {
      const data = await gql(
        `mutation ProposeLooks($id: ID!, $visualStyle: String, $shotType: String, $force: Boolean) { proposeCreativeCharacterLooks(id: $id, visualStyle: $visualStyle, shotType: $shotType, force: $force, termsAcknowledged: true) { ${LOOK_PROPOSAL_FIELDS} } }`,
        { id: String(args.id), visualStyle: args.visualStyle || null, shotType: args.shotType || null, force: args.force === true },
        true,
      );
      return formatLookProposal(data?.proposeCreativeCharacterLooks);
    },
  },
  {
    name: 'studio_character_look_commit',
    description: 'Commit a proposed look after the merchant picks a preview.',
    inputSchema: {
      type: 'object',
      properties: { id: { type: 'string' }, assetId: { type: 'number' }, previewUrl: { type: 'string' }, visualStyle: { type: 'string' } },
      required: ['id', 'assetId'],
    },
    execute: (args) => gql(
      `mutation CommitLook($id: ID!, $assetId: Int!, $previewUrl: String, $visualStyle: String) { commitCreativeCharacterLook(id: $id, assetId: $assetId, previewUrl: $previewUrl, visualStyle: $visualStyle) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id), assetId: Number(args.assetId), previewUrl: args.previewUrl || null, visualStyle: args.visualStyle || null },
      true,
    ),
  },
  {
    name: 'studio_character_look_package',
    description: 'Finish companion stills for the committed look (AI credits per missing still). Returns numbered HTTPS preview URLs. Show every photo.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, visualStyle: { type: 'string' } }, required: ['id'] },
    execute: async (args) => {
      await gql(
        `mutation LookPackage($id: ID!, $visualStyle: String) { completeCreativeCharacterLookPackage(id: $id, termsAcknowledged: true, visualStyle: $visualStyle) { ${CHARACTER_FIELDS} } }`,
        { id: String(args.id), visualStyle: args.visualStyle || null },
        true,
      );
      const data = await gql(
        `query LookStills($id: ID!, $visualStyle: String) { creativeCharacterLookStills(id: $id, visualStyle: $visualStyle) { ${LOOK_STILL_FIELDS} } }`,
        { id: String(args.id), visualStyle: args.visualStyle || null },
      );
      return formatLookStills(data?.creativeCharacterLookStills);
    },
  },
  {
    name: 'studio_character_looks',
    description: 'List locked look stills with HTTPS preview URLs. Show every photo.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, visualStyle: { type: 'string' } }, required: ['id'] },
    execute: async (args) => {
      const data = await gql(
        `query LookStills($id: ID!, $visualStyle: String) { creativeCharacterLookStills(id: $id, visualStyle: $visualStyle) { ${LOOK_STILL_FIELDS} } }`,
        { id: String(args.id), visualStyle: args.visualStyle || null },
      );
      return formatLookStills(data?.creativeCharacterLookStills);
    },
  },
  {
    name: 'studio_voices_search',
    description: 'Search the ElevenLabs shelf through Social Studio. Returns metadata and previewUrl. Show about 3. Never call ElevenLabs directly.',
    inputSchema: {
      type: 'object',
      properties: {
        search: { type: 'string' },
        gender: { type: 'string' },
        age: { type: 'string' },
        accent: { type: 'string' },
        language: { type: 'string' },
        useCases: { type: 'array', items: { type: 'string' } },
      },
    },
    execute: (args) => gql(
      `query SearchVoices($search: String, $gender: String, $age: String, $accent: String, $language: String, $useCases: [String!]) {
        searchCreativeVoices(search: $search, gender: $gender, age: $age, accent: $accent, language: $language, useCases: $useCases, pageSize: 8) {
          items { voiceId name description gender age accent language useCase previewUrl modelId }
          providerError hasMore totalCount
        }
      }`,
      {
        search: args.search || null,
        gender: args.gender || null,
        age: args.age || null,
        accent: args.accent || null,
        language: args.language || null,
        useCases: args.useCases || null,
      },
    ),
  },
  {
    name: 'studio_voices',
    description: 'List this channel voice bank.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { channelVoices { id name voiceId modelId kind previewUrl gender age accent language } }`),
  },
  {
    name: 'studio_voice_bookmark',
    description: 'Save a library voice into the channel bank. Prefer studio_character_lock_voice which bookmarks and locks in one step.',
    inputSchema: {
      type: 'object',
      properties: { voiceId: { type: 'string' }, name: { type: 'string' }, modelId: { type: 'string' }, previewUrl: { type: 'string' } },
      required: ['voiceId'],
    },
    execute: (args) => gql(
      `mutation Bookmark($voiceId: String!, $name: String, $modelId: String, $previewUrl: String) { bookmarkChannelVoice(voiceId: $voiceId, name: $name, modelId: $modelId, previewUrl: $previewUrl) { id name voiceId modelId } }`,
      { voiceId: String(args.voiceId), name: args.name || null, modelId: args.modelId || null, previewUrl: args.previewUrl || null },
      true,
    ),
  },
  {
    name: 'studio_voice_preview',
    description: 'Hear one script line in a voice. Returns audioUrl. Charges preview credits.',
    inputSchema: {
      type: 'object',
      properties: { text: { type: 'string' }, voiceId: { type: 'string' }, characterId: { type: 'string' } },
      required: ['text'],
    },
    execute: (args) => gql(
      `mutation PreviewVoice($text: String!, $voiceId: String, $characterId: ID) { previewCreativeCharacterVoice(text: $text, voiceId: $voiceId, characterId: $characterId) { audioUrl audioBase64 contentType charged previewsRemaining } }`,
      { text: String(args.text), voiceId: args.voiceId || null, characterId: args.characterId || null },
      true,
    ),
  },
  {
    name: 'studio_character_lock_voice',
    description: 'Bookmark if needed, assign, and lock an ElevenLabs voice on a character in one transaction.',
    inputSchema: {
      type: 'object',
      properties: { characterId: { type: 'string' }, voiceId: { type: 'string' }, name: { type: 'string' }, modelId: { type: 'string' }, previewUrl: { type: 'string' } },
      required: ['characterId', 'voiceId'],
    },
    execute: (args) => gql(
      `mutation LockVoice($characterId: ID!, $voiceId: String!, $name: String, $modelId: String, $previewUrl: String) { lockCreativeCharacterVoice(characterId: $characterId, voiceId: $voiceId, name: $name, modelId: $modelId, previewUrl: $previewUrl) { ${CHARACTER_FIELDS} } }`,
      { characterId: String(args.characterId), voiceId: String(args.voiceId), name: args.name || null, modelId: args.modelId || null, previewUrl: args.previewUrl || null },
      true,
    ),
  },
  {
    name: 'studio_character_unlock_voice',
    description: 'Unlock a character voice so it can be changed.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation UnlockVoice($id: ID!) { unlockCreativeCharacterVoice(id: $id) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id) },
      true,
    ),
  },
  {
    name: 'studio_character_duplicate',
    description: 'Duplicate a preset or existing character before locking a new voice.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation DupChar($id: ID!) { duplicateCreativeCharacter(id: $id) { ${CHARACTER_FIELDS} } }`,
      { id: String(args.id) },
      true,
    ),
  },
  {
    name: 'studio_character_deactivate',
    description: 'Deactivate a character. Does not delete.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => gql(
      `mutation DeactivateChar($id: ID!) { deactivateCreativeCharacter(id: $id) }`,
      { id: String(args.id) },
      true,
    ),
  },
  {
    name: 'studio_character_presets',
    description: 'Ensure adult preset characters exist on this channel.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`mutation { ensureCreativeCharacterPresets { ${CHARACTER_FIELDS} } }`, {}, true),
  },
  {
    name: 'studio_voice_rename',
    description: 'Rename a saved channel voice. Delete stays with a person.',
    inputSchema: { type: 'object', properties: { id: { type: 'string' }, name: { type: 'string' } }, required: ['id', 'name'] },
    execute: (args) => gql(
      `mutation RenameVoice($id: ID!, $name: String!) { renameChannelVoice(id: $id, name: $name) { id name } }`,
      { id: String(args.id), name: String(args.name) },
      true,
    ),
  },
  {
    name: 'studio_brand_kit_get',
    description: 'Read the channel Creative Studio brand kit (colors, end card, default music).',
    inputSchema: { type: 'object', properties: {} },
    execute: () => gql(`query { creativeBrandKit { id primaryColor accentColor typefaceId endCardLines defaultCharacterId defaultMusicAssetId } }`),
  },
  {
    name: 'studio_brand_kit_save',
    description: 'Save the channel brand kit used on overlays and end cards.',
    inputSchema: {
      type: 'object',
      properties: {
        primaryColor: { type: 'string' },
        accentColor: { type: 'string' },
        typefaceId: { type: 'string' },
        endCardLines: { type: 'array', items: { type: 'string' } },
        defaultCharacterId: { type: 'string' },
        defaultMusicAssetId: { type: 'number' },
      },
    },
    execute: (args) => gql(
      `mutation SaveKit($input: UpsertCreativeBrandKitInput!) { upsertCreativeBrandKit(input: $input) { id primaryColor accentColor typefaceId endCardLines defaultCharacterId defaultMusicAssetId } }`,
      { input: args },
      true,
    ),
  },
  {
    name: 'studio_review_resolve',
    description: 'Approve, decline, or tweak a Social Studio review-queue draft. action: accept | decline | tweak.',
    inputSchema: {
      type: 'object',
      properties: {
        postId: { type: 'string' },
        action: { type: 'string' },
        caption: { type: 'string' },
        scheduledAt: { type: 'string' },
      },
      required: ['postId', 'action'],
    },
    execute: (args) => gql(
      `mutation ResolveDraft($postId: ID!, $action: String!, $caption: String, $scheduledAt: String) { resolveSocialCoachingDraft(postId: $postId, action: $action, caption: $caption, scheduledAt: $scheduledAt) { id status } }`,
      { postId: String(args.postId), action: String(args.action), caption: args.caption || null, scheduledAt: args.scheduledAt || null },
      true,
    ),
  },
  {
    name: 'social_analytics',
    description: 'Social Studio analytics for this channel. Call social_metrics_sync first if numbers look stale.',
    inputSchema: { type: 'object', properties: { storeId: { type: 'number' }, rangeDays: { type: 'number' } } },
    execute: (args) => gql(
      `query Analytics($storeId: Int, $rangeDays: Int) { socialAnalytics(storeId: $storeId, rangeDays: $rangeDays) { rangeDays totals { posts posted impressions likes comments shares clicks engagementScore } byPlatform { key label posts engagementScore impressions } topPosts { id caption platform accountName postedAt publishedUrl engagementScore } } }`,
      { storeId: args.storeId ?? null, rangeDays: args.rangeDays ?? 30 },
    ),
  },
  {
    name: 'social_metrics_sync',
    description: 'Refresh views, clicks, and engagement on Social Studio posts.',
    inputSchema: { type: 'object', properties: { postId: { type: 'string' } } },
    execute: (args) => gql(
      `mutation SyncMetrics($postId: ID) { syncSocialPostMetrics(postId: $postId) { syncedCount failedCount } }`,
      { postId: args.postId || null },
      true,
    ),
  },
  {
    name: 'studio_brief_start',
    description: 'Start a conversational brief session.',
    inputSchema: { type: 'object', properties: { briefId: { type: 'string' }, storeId: { type: 'number' } } },
    execute: (args) => gql(
      `mutation StartBrief($briefId: ID, $storeId: Int) { startCreativeBriefSession(briefId: $briefId, storeId: $storeId) { brief { ${BRIEF_FIELDS} } nextQuestion { id field prompt } completeness { complete missing } } }`,
      { briefId: args.briefId || null, storeId: args.storeId ?? null },
      true,
    ),
  },
  {
    name: 'studio_video_plan',
    description: 'Quote a video path before spend. Returns idea prompts, Hands-free vs Guided, first-film vs template reuse, and motion cost before render. Guided product ads use listing photos as start and end frames; 3D is not in this quote.',
    inputSchema: {
      type: 'object',
      properties: {
        idea: { type: 'string' },
        sceneCount: { type: 'number' },
        quality: { type: 'string' },
        hasLockedScript: { type: 'boolean' },
      },
    },
    execute: async (args) => {
      const pricing = await gql(`query { creativeStudioPricing { canSpend balance scriptPack scriptRevise keyframePerScene videoStandardPerScene videoPremiumPerScene videoCinemaPerScene timelineStitchStandard } }`);
      const p = pricing.creativeStudioPricing || {};
      const scenes = Math.max(1, Math.min(8, Number(args.sceneCount) || 3));
      const quality = String(args.quality || 'standard').toLowerCase();
      const motionUnit = quality === 'hero' || quality === 'cinema'
        ? Number(p.videoCinemaPerScene || 350)
        : quality === 'premium' || quality === 'kling'
          ? Number(p.videoPremiumPerScene || 150)
          : Number(p.videoStandardPerScene || 150);
      const stills = scenes * Number(p.keyframePerScene || 12);
      const motion = scenes * motionUnit;
      const stitch = Number(p.timelineStitchStandard || 0);
      const firstFilm = Number(p.scriptPack || 15) + stills + motion + stitch;
      const nextSku = stills + motion + stitch;
      return {
        ideaPrompts: [
          'Show the product in the real room it belongs in, then a close detail, then the CTA.',
          'Walk through one benefit per beat. Keep the voiceover short enough to read on screen.',
          'Open on listing photo A, orbit to listing photo B, then burn the merchant headline at stitch. Do not letter the SKU name.',
        ],
        modes: {
          handsFree: 'studio_produce_video. One async job, brief-to-stitch. Use when they gave a short idea, not a finished script.',
          guided: 'Stepwise studio_* tools. Use when they wrote the script, picked a look, or locked a voice.',
        },
        firstFilmCredits: args.hasLockedScript ? nextSku : firstFilm,
        nextSkuCredits: nextSku,
        republishCredits: 0,
        breakdown: { stills, motion, stitch, scriptPack: args.hasLockedScript ? 0 : Number(p.scriptPack || 15) },
        balance: Number(p.balance || 0),
        idea: args.idea || null,
        note: 'Ready stills and clips are free. Call the spend tools with confirm true after the merchant agrees.',
      };
    },
  },
  {
    name: 'studio_stitch_from_script',
    description: 'Stitch rendered scenes for a script. Pass sceneIds to swap clip order. Overlays burn merchant on-screen text and CTA here. Voiceover stays off unless includeVoiceover is true and a voice is locked. Warns if the end card is over 4 seconds. The result URL must be an MP4.',
    inputSchema: {
      type: 'object',
      properties: {
        scriptId: { type: 'string' },
        sceneIds: { type: 'array', items: { type: 'string' } },
        includeVoiceover: { type: 'boolean' },
        qualityTier: { type: 'string' },
      },
      required: ['scriptId'],
    },
    execute: async (args) => {
      const scenesRes = await gql(
        `query Scenes($scriptId: ID!) { creativeScriptScenes(scriptId: $scriptId) { ${SCENE_FIELDS} } }`,
        { scriptId: String(args.scriptId) },
      );
      const scenes = scenesRes.creativeScriptScenes || [];
      const clips = orderScenesForStitch(scenes, args.sceneIds);
      const lastId = clips[clips.length - 1]?.sceneId;
      const last = scenes.find((s) => Number(s.id) === Number(lastId));
      const warning = /end card/i.test(String(last?.label || '')) && Number(last?.durationSeconds) > 4
        ? `End card is ${last.durationSeconds}s. Keep it at 4 seconds or less.`
        : null;
      const exportRes = await gql(
        `mutation Timeline($scriptId: ID!, $input: CreativeTimelineInput!) { renderCreativeTimeline(scriptId: $scriptId, input: $input) { id status outputUrl progress errorMessage creditsUsed } }`,
        {
          scriptId: String(args.scriptId),
          input: {
            clips,
            qualityTier: args.qualityTier || 'standard',
            includeVoiceover: args.includeVoiceover === true,
            burnOverlays: true,
          },
        },
        true,
      );
      return { ...exportRes, warning, clipCount: clips.length };
    },
  },
];

export const studioTools = RAW_STUDIO_TOOLS.map(wrapCreditTool);
