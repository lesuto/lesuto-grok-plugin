import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deniedOp, extractFields } from './lib/denied-ops.mjs';
import { TOOLS } from './server.mjs';
import { commerceTools } from './tools/commerce.mjs';
import { marketplaceTools, MARKETPLACE_OPERATOR_GUIDE } from './tools/marketplace.mjs';
import { catalogTools, CATALOG_OPERATOR_GUIDE } from './tools/catalog.mjs';
import { sitesTools } from './tools/sites.mjs';
import { jsonResponse, pluginRoot, withAgentEnv, withMockFetch } from './test/helpers.mjs';

test('every tool has execute, schema, and a unique name', () => {
  const names = new Set();
  for (const tool of TOOLS) {
    assert.equal(typeof tool.name, 'string');
    assert.equal(typeof tool.execute, 'function');
    assert.equal(tool.inputSchema?.type, 'object');
    assert.equal(names.has(tool.name), false, tool.name);
    names.add(tool.name);
  }
});

test('org and store rollup tools skip the channel token', () => {
  const org = readFileSync(join(pluginRoot, 'tools/org.mjs'), 'utf8');
  const stores = readFileSync(join(pluginRoot, 'tools/stores.mjs'), 'utf8');
  assert.equal((org.match(/requireStore: false/g) || []).length, 2);
  assert.equal((stores.match(/requireStore: false/g) || []).length, 3);
});

test('tool GraphQL operations are not on the merchant denylist', () => {
  for (const rel of ['tools/connect.mjs', 'tools/commerce.mjs', 'tools/hub.mjs', 'tools/blog.mjs', 'tools/stores.mjs', 'tools/org.mjs', 'tools/social.mjs', 'tools/studio.mjs', 'tools/studio-extra.mjs', 'tools/marketplace.mjs', 'tools/catalog.mjs', 'tools/sites.mjs']) {
    const src = readFileSync(join(pluginRoot, rel), 'utf8');
    const blocks = [...src.matchAll(/`((?:query|mutation)[\s\S]*?)`/g)].map((m) => m[1]);
    assert.ok(blocks.length > 0, rel);
    for (const gql of blocks) {
      for (const field of extractFields(gql)) {
        assert.equal(deniedOp(field), false, `${rel} ${field}`);
      }
    }
  }
});

test('create_booking_invite only emails when sendEmail is true', async () => {
  const tool = TOOLS.find((t) => t.name === 'create_booking_invite');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.i.sendEmail, false);
      assert.equal(body.variables.i.guestEmail, null);
      return jsonResponse(200, { data: { createBookingInvite: { id: '1' } } });
    }, async () => {
      await tool.execute({ meetingTypeId: 'mt-1' });
    });
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.i.sendEmail, true);
      assert.equal(body.variables.i.guestEmail, 'guest@example.com');
      return jsonResponse(200, { data: { createBookingInvite: { id: '2' } } });
    }, async () => {
      await tool.execute({ meetingTypeId: 'mt-1', guestEmail: 'guest@example.com', sendEmail: true });
    });
  });
});

test('org_overview maps 1y to last 365 days and ytd to January 1', async () => {
  const { orgTools, orgPeriodRange } = await import('./tools/org.mjs');
  const ytd = orgPeriodRange('ytd');
  const year = orgPeriodRange('1y');
  assert.equal(new Date(ytd.startDate).getUTCMonth(), 0);
  assert.equal(new Date(ytd.startDate).getUTCDate(), 1);
  const yearMs = new Date(year.endDate) - new Date(year.startDate);
  assert.ok(yearMs >= 364 * 24 * 60 * 60 * 1000);
  const tool = orgTools.find((t) => t.name === 'org_overview');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.orgId, '9');
      assert.equal(body.variables.filters.includeChildOrgs, true);
      return jsonResponse(200, { data: { organizationOverview: { totalOrders: 0 } } });
    }, async () => {
      await tool.execute({ orgId: '9', period: '1y', includeChildOrgs: true });
    });
  });
});

test('channel_analytics coerces unknown periods to 30d', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.period, '30d');
      return jsonResponse(200, { data: { dashboardAnalytics: {} } });
    }, async () => {
      const tool = commerceTools.find((t) => t.name === 'channel_analytics');
      await tool.execute({ period: 'forever' });
    });
  });
});

test('orders_snapshot caps take at 50', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.take, 50);
      return jsonResponse(200, { data: { orders: { items: [] } } });
    }, async () => {
      const tool = commerceTools.find((t) => t.name === 'orders_snapshot');
      await tool.execute({ take: 999 });
    });
  });
});

test('inventory_stock caps take at 25', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.take, 25);
      return jsonResponse(200, { data: { products: { items: [] } } });
    }, async () => {
      const tool = commerceTools.find((t) => t.name === 'inventory_stock');
      await tool.execute({ term: 'chair', take: 999 });
    });
  });
});

test('blog_create stays draft unless publish is true', async () => {
  const tool = TOOLS.find((t) => t.name === 'blog_create');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.query, /channelBlogCreatePost/);
      assert.equal(body.variables.input.status, 'draft');
      return jsonResponse(200, { data: { channelBlogCreatePost: { id: 'p1', status: 'draft' } } });
    }, async (calls) => {
      await tool.execute({ title: 'Hello Store' });
      assert.equal(calls.length, 1);
    });
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      if (body.query.includes('channelBlogCreatePost')) {
        return jsonResponse(200, { data: { channelBlogCreatePost: { id: 'p2', status: 'draft' } } });
      }
      assert.match(body.query, /aiBlogPublishPost/);
      assert.equal(body.variables.id, 'p2');
      return jsonResponse(200, { data: { aiBlogPublishPost: { id: 'p2', status: 'published' } } });
    }, async (calls) => {
      await tool.execute({ title: 'Hello Store', publish: true });
      assert.equal(calls.length, 2);
    });
  });
});

test('org_overview coerces unknown periods to 30d', async () => {
  const tool = TOOLS.find((t) => t.name === 'org_overview');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.equal(body.variables.orgId, '12');
      assert.equal(typeof body.variables.filters.startDate, 'string');
      assert.equal(typeof body.variables.filters.endDate, 'string');
      return jsonResponse(200, { data: { organizationOverview: { totalRevenue: 0 } } });
    }, async () => {
      await tool.execute({ orgId: '12', period: 'forever' });
    });
  });
});

test('blog_delete is not a tool', () => {
  assert.equal(TOOLS.some((t) => t.name === 'blog_delete'), false);
});

test('skills cover Connect, catalog, orders, analytics, organizations, and Social Studio', () => {
  const dir = join(pluginRoot, 'skills');
  const names = readdirSync(dir);
  for (const need of ['lesuto-connect', 'lesuto-catalog', 'lesuto-orders', 'lesuto-analytics', 'lesuto-organizations', 'lesuto-social']) {
    assert.ok(names.includes(need), need);
    const skill = readFileSync(join(dir, need, 'SKILL.md'), 'utf8');
    assert.match(skill, /api\.lesuto\.com|Lesuto/);
    assert.doesNotMatch(skill, /issueAgentAccessKey/);
    assert.doesNotMatch(skill, /CRM_AGENT_TOKEN/);
    assert.doesNotMatch(skill, /crm_/);
    assert.doesNotMatch(skill, /mcp\/crm-agent/);
    assert.match(skill, /staff CRM|store work only|merchant/i);
  }
  const connect = readFileSync(join(dir, 'lesuto-connect/SKILL.md'), 'utf8');
  assert.match(connect, /list_meeting_types/);
  assert.match(connect, /guestEmail/);
  const orders = readFileSync(join(dir, 'lesuto-orders/SKILL.md'), 'utf8');
  assert.match(orders, /orders_snapshot/);
  assert.match(orders, /Never mint/);
  const catalog = readFileSync(join(dir, 'lesuto-catalog/SKILL.md'), 'utf8');
  assert.match(catalog, /search_catalog/);
  const analytics = readFileSync(join(dir, 'lesuto-analytics/SKILL.md'), 'utf8');
  assert.match(analytics, /channel_analytics/);
  const orgs = readFileSync(join(dir, 'lesuto-organizations/SKILL.md'), 'utf8');
  assert.match(orgs, /list_organizations/);
  assert.match(orgs, /org_overview/);
  const social = readFileSync(join(dir, 'lesuto-social/SKILL.md'), 'utf8');
  assert.match(social, /studio_produce_video/);
  assert.match(social, /studio_operator_guide/);
  assert.match(social, /studio_character_lock_voice/);
  assert.match(social, /studio_character_looks_propose/);
  assert.match(social, /numbered HTTPS preview URLs/);
  assert.match(social, /12 AI credits/);
  assert.match(social, /2 integration credits/);
  assert.match(social, /studio_keyframes/);
  assert.match(social, /studio_catalog_angles/);
  assert.match(social, /keyframeAssetId/);
  assert.match(social, /studio_scenes_reorder/);
  assert.match(social, /Talent in the product/);
  assert.match(social, /studio_keyframe_regenerate/);
  assert.match(social, /\.mp4\.png/);
  assert.match(social, /studio_reconstruct_3d/);
  assert.match(social, /Skip 3D unless they asked for a mesh/);
  assert.match(social, /Never call ElevenLabs/);
  assert.match(social, /search_catalog` for the product they named/);
  const houseNames = [
    ['Anderson', ' Teak'].join(''),
    'Ashcroft',
    ['Glen', ' Hyman'].join(''),
  ];
  for (const name of houseNames) {
    assert.equal(social.toLowerCase().includes(name.toLowerCase()), false, name);
  }
});

test('studio look propose formats numbered photo URLs', async () => {
  const { formatLookProposal, formatLookStills } = await import('./tools/studio.mjs');
  const proposed = formatLookProposal({
    characterId: '12',
    visualStyle: 'realistic',
    creditsCharged: 100,
    candidates: [
      { assetId: 441, previewUrl: 'https://cdn.lesuto.com/a.jpg' },
      { assetId: 442, previewUrl: 'https://cdn.lesuto.com/b.jpg' },
    ],
  });
  assert.equal(proposed.creditsCharged, 100);
  assert.equal(proposed.looks[0].assetId, 441);
  assert.match(proposed.message, /!\[Look 1\]\(https:\/\/cdn\.lesuto\.com\/a\.jpg\)/);
  assert.match(proposed.message, /Ask which look to keep/);
  assert.match(proposed.message, /100 \(50 per still\)/);
  const { studioTools } = await import('./tools/studio.mjs');
  const propose = studioTools.find((t) => t.name === 'studio_character_looks_propose');
  assert.equal(propose.inputSchema.properties.force.type, 'boolean');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      if (String(body.query).includes('creativeStudioPricing')) {
        return jsonResponse(200, { data: { creativeStudioPricing: { canSpend: true, balance: 5000, characterLookPackage: 24 } } });
      }
      assert.equal(body.variables.visualStyle, null);
      assert.equal(body.variables.shotType, null);
      assert.equal(body.variables.force, true);
      return jsonResponse(200, { data: { proposeCreativeCharacterLooks: { characterId: '7', creditsCharged: 100, candidates: [] } } });
    }, async () => {
      await propose.execute({ id: '7', force: true, confirm: true });
    });
  });
  const stills = formatLookStills([
    { shotType: 'portrait', assetId: 441, previewUrl: 'https://cdn.lesuto.com/a.jpg' },
    { shotType: 'full_body', assetId: 11, previewUrl: 'https://cdn.lesuto.com/full.jpg' },
  ]);
  assert.match(stills.message, /!\[full_body\]/);
  assert.equal(stills.looks[1].assetId, 11);
});

test('social_generate_video passes Veo native audio on Cinema', async () => {
  const { engineForNativeAudio, socialTools, SOCIAL_OPERATOR_GUIDE } = await import('./tools/social.mjs');
  assert.equal(engineForNativeAudio(null, true), 'cinema');
  assert.equal(engineForNativeAudio('luma', true), 'cinema');
  assert.equal(engineForNativeAudio('veo-3.1', true), 'veo-3.1');
  assert.equal(engineForNativeAudio('seedance', false), 'seedance');
  assert.match(SOCIAL_OPERATOR_GUIDE, /social_generate_video with includeAudio true/);
  const tool = socialTools.find((t) => t.name === 'social_generate_video');
  assert.equal(tool.inputSchema.properties.includeAudio.type, 'boolean');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      if (String(body.query).includes('creativeStudioPricing')) {
        return jsonResponse(200, { data: { creativeStudioPricing: { canSpend: true, balance: 5000, videoStandardPerScene: 120, videoCinemaPerScene: 350 } } });
      }
      assert.equal(body.variables.input.includeAudio, true);
      assert.equal(body.variables.input.engine, 'cinema');
      assert.equal(body.variables.input.termsAcknowledged, true);
      return jsonResponse(200, { data: { aiGenerateVideoJob: { jobId: 'v1', estimatedMs: 1 } } });
    }, async () => {
      const quoted = await tool.execute({ prompt: 'teak chair in rain', includeAudio: true });
      assert.equal(quoted.needsConfirm, true);
      assert.equal(quoted.credits, 350);
      await tool.execute({ prompt: 'teak chair in rain', includeAudio: true, confirm: true });
    });
  });
});

test('studio_produce_video snaps duration and can pass a hub store', async () => {
  const { snapStudioDuration, socialTools } = await import('./tools/social.mjs');
  assert.equal(snapStudioDuration(25), 30);
  assert.equal(snapStudioDuration(7), 6);
  assert.equal(snapStudioDuration(undefined), 8);
  const stores = socialTools.find((t) => t.name === 'studio_stores');
  assert.match(stores.description, /not list_stores/);
  const tool = socialTools.find((t) => t.name === 'studio_produce_video');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      if (String(body.query).includes('creativeStudioPricing')) {
        return jsonResponse(200, { data: { creativeStudioPricing: { canSpend: true, balance: 5000, videoStandardPerScene: 120 } } });
      }
      assert.equal(body.variables.input.durationSeconds, 30);
      assert.equal(body.variables.input.storeId, 12);
      assert.equal(body.variables.input.includeAudio, false);
      assert.equal(body.variables.input.termsAcknowledged, true);
      return jsonResponse(200, { data: { aiProduceStudioVideoJob: { jobId: '1', estimatedMs: 1 } } });
    }, async () => {
      await tool.execute({ prompt: 'teak chair', durationSeconds: 25, storeId: 12, confirm: true });
    });
  });
});

test('studio stitch clip order and talent restage tools exist', async () => {
  const { orderScenesForStitch } = await import('./lib/studio-clips.mjs');
  const clips = orderScenesForStitch([
    { id: '1', renderedAssetId: 10, durationSeconds: 5, label: 'A' },
    { id: '2', renderedAssetId: 20, durationSeconds: 6, label: 'B' },
    { id: '3', renderedAssetId: 30, durationSeconds: 4, label: 'C' },
  ], ['2']);
  assert.equal(clips[0].sceneId, 2);
  assert.equal(clips[0].assetId, undefined);
  assert.equal(clips[0].outSec, 6);
  assert.equal(clips[1].sceneId, 1);
  assert.equal(clips[2].sceneId, 3);
  assert.throws(() => orderScenesForStitch([{ id: '1' }], ['1']), /Render scenes before stitching/);
  assert.throws(
    () => orderScenesForStitch([{ id: '1', renderedAssetId: 10, durationSeconds: 5 }], ['9']),
    /no rendered clip/,
  );
  const { studioTools } = await import('./tools/studio.mjs');
  const reorder = studioTools.find((t) => t.name === 'studio_scenes_reorder');
  assert.ok(reorder);
  assert.match(reorder.description, /Hook badge stays/);
  assert.equal(/becomes the opening hook/i.test(reorder.description), false);
  assert.match(studioTools.find((t) => t.name === 'studio_keyframe_regenerate').description, /stillMode/);
  assert.match(studioTools.find((t) => t.name === 'studio_scene_update').description, /listing_orbit/);
  assert.match(studioTools.find((t) => t.name === 'studio_scene_update').description, /stillsCleared/);
  assert.match(studioTools.find((t) => t.name === 'studio_scene_update').description, /startAssetId/);
  assert.ok(studioTools.find((t) => t.name === 'studio_assets'));
  assert.ok(studioTools.find((t) => t.name === 'studio_shot_presets'));
  assert.ok(studioTools.find((t) => t.name === 'studio_music_search'));
  assert.match(studioTools.find((t) => t.name === 'studio_render_scenes').description, /includeAudio/);
  assert.match(studioTools.find((t) => t.name === 'studio_stitch_from_script').description, /cinema/);
  assert.match(readFileSync(join(pluginRoot, 'tools/studio.mjs'), 'utf8'), /stillsCleared: true/);
  assert.match(readFileSync(join(pluginRoot, 'tools/studio.mjs'), 'utf8'), /args\.stillMode \|\| preset\?\.stillMode/);
  const stillModes = studioTools.find((t) => t.name === 'studio_still_modes');
  assert.ok(stillModes);
  assert.match(stillModes.description, /talent_restage/);
  assert.match(stillModes.description, /no_product/);
});

test('studio_job_status ignores .mp4.png posters', async () => {
  const { annotateStudioJobMedia, socialTools, SOCIAL_OPERATOR_GUIDE } = await import('./tools/social.mjs');
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_catalog_angles/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_still_modes/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_keyframe_regenerate/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_assets/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_shot_presets/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /studio_music_search/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /lesuto_graphql is read-only/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /Changing stillMode/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /PNG still/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /steps.assetId/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /\.mp4\.png/);
  assert.match(SOCIAL_OPERATOR_GUIDE, /optional GLB/);
  const flagged = annotateStudioJobMedia({
    aiMediaJobStatus: {
      result: {
        outputUrl: 'https://cdn.lesuto.com/preview/0ab6b4bed7ff__preview.mp4.png',
        steps: [{ preview: 'https://cdn.lesuto.com/preview/0ab6b4bed7ff__preview.mp4.png' }],
      },
    },
  });
  assert.equal(flagged.playableOutputUrl, null);
  assert.equal(flagged.posterIsNotTheVideo, true);
  assert.match(flagged.mediaNote, /document-icon/);
  const playable = annotateStudioJobMedia({
    aiMediaJobStatus: {
      result: { outputUrl: 'https://cdn.lesuto.com/assets/clip.mp4', steps: [] },
    },
  });
  assert.equal(playable.playableOutputUrl, 'https://cdn.lesuto.com/assets/clip.mp4');
  assert.equal(playable.posterIsNotTheVideo, false);
  const job = socialTools.find((t) => t.name === 'studio_job_status');
  assert.match(job.description, /PNG still/);
  const jobSrc = readFileSync(join(pluginRoot, 'tools/social.mjs'), 'utf8');
  assert.match(jobSrc, /steps \{ stepId assetId preview creditsUsed success error \}/);
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, {
      data: {
        aiMediaJobStatus: {
          id: '9',
          state: 'COMPLETED',
          result: { outputUrl: 'https://cdn.lesuto.com/x.mp4.png', steps: [] },
        },
      },
    }), async () => {
      const out = await job.execute({ jobId: '9' });
      assert.equal(out.posterIsNotTheVideo, true);
      assert.equal(out.playableOutputUrl, null);
    });
  });
});

test('studio keyframes and scene renders enqueue with sceneId', () => {
  const src = readFileSync(join(pluginRoot, 'tools/studio.mjs'), 'utf8');
  assert.match(src, /enqueueCreativeKeyframes\(scriptId: \$scriptId, sceneId: \$sceneId/);
  assert.match(src, /enqueueCreativeSceneRenders\(scriptId: \$scriptId, sceneId: \$sceneId/);
  const extra = readFileSync(join(pluginRoot, 'tools/studio-extra.mjs'), 'utf8');
  assert.match(extra, /name: 'studio_reconstruct_3d'/);
  assert.match(extra, /Not required for SKU video/);
  assert.match(readFileSync(join(pluginRoot, 'tools/studio.mjs'), 'utf8'), /studio_catalog_angles/);
  const keyframes = src.slice(src.indexOf("name: 'studio_keyframes'"), src.indexOf("name: 'studio_keyframe_regenerate'"));
  assert.equal(keyframes.includes('generateCreativeKeyframes'), false);
  const regen = src.slice(src.indexOf("name: 'studio_keyframe_regenerate'"), src.indexOf("name: 'studio_render_scenes'"));
  assert.match(regen, /enqueueCreativeKeyframes/);
  assert.equal(regen.includes('generateCreativeKeyframes'), false);
  const renders = src.slice(src.indexOf("name: 'studio_render_scenes'"), src.indexOf("name: 'studio_render_storyboard'"));
  assert.equal(renders.includes('renderCreativeScenes('), false);
});

test('hub and Social Studio tools return share URLs and connected accounts', async () => {
  const hub = readFileSync(join(pluginRoot, 'tools/hub.mjs'), 'utf8');
  const social = readFileSync(join(pluginRoot, 'tools/social.mjs'), 'utf8');
  const studio = readFileSync(join(pluginRoot, 'tools/studio.mjs'), 'utf8');
  assert.match(hub, /hub_posts[\s\S]*hubPermalink/);
  assert.match(hub, /createStorePost[\s\S]*hubPermalink/);
  assert.match(hub, /updateStorePost[\s\S]*hubPermalink/);
  assert.match(hub, /createScene[\s\S]*hubPermalink/);
  assert.match(hub, /beginAsyncScenePublish[\s\S]*hubPermalink/);
  assert.match(social, /name: 'social_posts'/);
  assert.match(social, /socialAutomationPosts/);
  assert.match(social, /SOCIAL_POST_SHARE_FIELDS[\s\S]*publishedUrl/);
  assert.match(social, /connection \{ platform accountName \}/);
  assert.match(social, /Not Hub shoppers/);
  assert.match(studio, /topPosts[\s\S]*publishedUrl/);
  assert.match(social, /SOCIAL_OPERATOR_GUIDE[\s\S]*hubPermalink/);
  assert.equal(hub.includes('mentionedCustomerIds'), false);
  assert.equal(social.includes('mentionedCustomerIds'), false);
  assert.equal(social.includes('shareToken'), false);
  assert.match(hub, /graphqlWithHubPermalinkFallback/);
});

test('hub GraphQL retries without hubPermalink on schema lag and still returns a share URL', async () => {
  const {
    graphqlWithHubPermalinkFallback,
    stripHubPermalinkField,
    fallbackHubPermalink,
  } = await import('./lib/hub-permalink-tiers.mjs');
  const stripped = stripHubPermalinkField('{ id title hubPermalink }');
  assert.match(stripped, /id/);
  assert.equal(/\bhubPermalink\b/.test(stripped), false);
  assert.equal(fallbackHubPermalink('42', 'post'), 'https://hub.lesuto.com/post/42');
  assert.equal(fallbackHubPermalink('7', 'scene'), 'https://hub.lesuto.com/scenes?id=7');
  const send = async (query) => {
    if (/\bhubPermalink\b/.test(query)) {
      throw new Error('Cannot query field "hubPermalink" on type "StorePost".');
    }
    return { storePosts: [{ id: '9', title: 'Patio' }] };
  };
  const out = await graphqlWithHubPermalinkFallback(
    send,
    'query { storePosts { id title hubPermalink } }',
    {},
  );
  assert.equal(out.storePosts[0].hubPermalink, 'https://hub.lesuto.com/post/9');
});

test('social_posts rejects unknown status values', async () => {
  const { socialPostStatusArg } = await import('./tools/social.mjs');
  assert.equal(socialPostStatusArg(null), null);
  assert.equal(socialPostStatusArg('posted'), 'posted');
  await assert.rejects(() => Promise.resolve().then(() => socialPostStatusArg('customers')), /status must be/);
});

test('studio GraphQL retries without stillMode on schema lag and refuses silent stillMode writes', async () => {
  const { graphqlWithSceneFieldTiers, stripSceneContractFields } = await import('./lib/scene-field-tiers.mjs');
  const stripped = stripSceneContractFields('status stillMode productId errorMessage keyframeAssetId');
  assert.match(stripped, /status/);
  assert.equal(/stillMode/.test(stripped), false);
  const send = async (query) => {
    if (/stillMode/.test(query)) throw new Error('Cannot query field "stillMode" on type "CreativeScene".');
    return { ok: true };
  };
  const out = await graphqlWithSceneFieldTiers(send, 'query { creativeScriptScenes { stillMode action } }', {});
  assert.equal(out.ok, true);
  await assert.rejects(
    () => graphqlWithSceneFieldTiers(
      send,
      'mutation { updateCreativeScene { stillMode } }',
      { input: { stillMode: 'lifestyle' } },
    ),
    /Still mode is not on this API yet/,
  );
});

test('marketplace tools are registered and subscribe is confirm-gated channel_only', async () => {
  for (const name of ['marketplace_operator_guide', 'list_subscriptions', 'subscribe_to_supplier', 'list_deployments', 'list_channel_domains']) {
    assert.ok(TOOLS.some((t) => t.name === name), name);
  }
  assert.match(MARKETPLACE_OPERATOR_GUIDE, /channel_only/);
  assert.match(MARKETPLACE_OPERATOR_GUIDE, /mySubscriptions/);
  assert.match(MARKETPLACE_OPERATOR_GUIDE, /There is no supplierSubscriptions query/);
  const subscribe = marketplaceTools.find((t) => t.name === 'subscribe_to_supplier');
  await withAgentEnv(async () => {
    await assert.rejects(
      () => Promise.resolve().then(() => subscribe.execute({ supplierChannelId: '9' })),
      /confirm: true/,
    );
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.query, /subscribeToSupplier/);
      assert.equal(body.variables.storeRoutingMode, 'channel_only');
      assert.equal(body.variables.subscriptionType, 'selective');
      assert.equal(body.variables.targetDeploymentIds, null);
      return jsonResponse(200, { data: { subscribeToSupplier: true } });
    }, async () => {
      await subscribe.execute({ supplierChannelId: '9', confirm: true });
    });
  });
});

test('catalog tools stay on add/remove and never createProduct', async () => {
  for (const name of ['catalog_operator_guide', 'suggest_catalog', 'create_store', 'create_store_collection', 'add_products_to_store', 'add_products_to_collection', 'collection_banner_options', 'set_store_collection_details', 'preview_smart_collection', 'create_smart_collection', 'update_smart_collection_rule', 'list_supplier_collections', 'subscribe_to_supplier_collection']) {
    assert.ok(TOOLS.some((t) => t.name === name), name);
  }
  assert.match(CATALOG_OPERATOR_GUIDE, /createProduct/);
  assert.match(CATALOG_OPERATOR_GUIDE, /add_products_to_collection/);
  assert.match(CATALOG_OPERATOR_GUIDE, /set_store_collection_details/);
  assert.match(CATALOG_OPERATOR_GUIDE, /create_smart_collection/);
  assert.match(CATALOG_OPERATOR_GUIDE, /autoGenerateCollections/);
  assert.match(CATALOG_OPERATOR_GUIDE, /updateStoreAutoSync/);
  const createCollection = catalogTools.find((t) => t.name === 'create_store_collection');
  const src = String(createCollection.execute);
  assert.equal(src.includes('productIds'), false);
  const details = catalogTools.find((t) => t.name === 'set_store_collection_details');
  assert.equal(String(details.execute).includes('productIds'), false);
  assert.match(details.description, /Never sends productIds/);
  const smartCreate = catalogTools.find((t) => t.name === 'create_smart_collection');
  assert.match(String(smartCreate.execute), /createRuleBasedCollection/);
  const smartRule = catalogTools.find((t) => t.name === 'update_smart_collection_rule');
  assert.match(String(smartRule.execute), /setMerchantCollectionRule/);
  assert.equal(String(smartRule.execute).includes('updateCollectionRule'), false);
  assert.equal(deniedOp('setMerchantCollectionDetails'), false);
  assert.equal(deniedOp('setMerchantCollectionRule'), false);
  assert.equal(deniedOp('createRuleBasedCollection'), false);
  assert.equal(deniedOp('updateCollectionRule'), true);
  assert.equal(deniedOp('updateMerchantCollection'), true);
  assert.equal(deniedOp('autoGenerateCollections'), true);
  assert.equal(deniedOp('updateStoreAutoSync'), true);
  await withAgentEnv(async () => {
    await assert.rejects(
      () => Promise.resolve().then(() => catalogTools.find((t) => t.name === 'add_products_to_store').execute({ storeId: '1', productIds: ['2'] })),
      /confirm: true/,
    );
    await assert.rejects(
      () => Promise.resolve().then(() => catalogTools.find((t) => t.name === 'create_smart_collection').execute({ name: 'Teak', storeId: '1' })),
      /confirm: true/,
    );
    await assert.rejects(
      () => Promise.resolve().then(() => catalogTools.find((t) => t.name === 'create_smart_collection').execute({ name: 'Teak', storeId: '1', confirm: true })),
      /keyword, product type, supplier, or facet/,
    );
    await assert.rejects(
      () => Promise.resolve().then(() => catalogTools.find((t) => t.name === 'subscribe_to_supplier_collection').execute({ supplierChannelId: '9', supplierCollectionId: '12' })),
      /confirm: true/,
    );
  });
});

test('sites unwrap never documents printing the secret', () => {
  const unwrap = sitesTools.find((t) => t.name === 'unwrap_site_login');
  assert.match(unwrap.description, /Do not print the secret/);
  assert.equal(deniedOp('saveSiteLogin'), true);
  assert.equal(deniedOp('unwrapSiteLogin'), false);
  assert.equal(deniedOp('addProductsToStore'), false);
  assert.equal(deniedOp('createProduct'), true);
  assert.equal(deniedOp('updateMerchantCollection'), true);
  assert.equal(deniedOp('createMerchantCollection'), false);
});
