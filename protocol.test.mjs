import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TOOLS } from './server.mjs';
import { studioTools } from './tools/studio.mjs';
import { studioExtraTools } from './tools/studio-extra.mjs';
import { jsonResponse, withAgentEnv, withMockFetch } from './test/helpers.mjs';

const EXPECTED_TOOLS = [
  'lesuto_graphql',
  'list_meeting_types', 'create_booking_invite', 'create_host_booking', 'list_upcoming_bookings',
  'cancel_booking', 'complete_booking', 'no_show_booking',
  'orders_snapshot', 'search_catalog', 'inventory_stock', 'channel_analytics', 'shipping_labels',
  'adjust_variant_stock', 'create_shipment', 'buy_shipping_label',
  'store_status', 'site_status', 'hub_posts', 'hub_create_post', 'hub_create_scene', 'hub_create_story', 'hub_update_post',
  'blog_list', 'blog_get', 'blog_create', 'blog_generate', 'blog_update', 'blog_publish', 'blog_unpublish', 'blog_bake_cover',
  'blog_cadence_save', 'blog_cadence_list',
  'social_connections', 'social_posts', 'social_growth_line_draft', 'social_growth_line_save',
  'social_campaign_draft', 'social_campaign_save', 'social_campaign_arm', 'social_campaign_pause',
  'social_post_schedule', 'ai_media_license_status', 'social_generate_image', 'social_generate_video',
  'studio_operator_guide', 'studio_stores', 'studio_produce_video', 'studio_job_status', 'studio_launch_campaign', 'studio_review_queue',
  'social_campaign_resume', 'social_campaign_cancel', 'social_growth_lines', 'social_campaigns', 'social_caption',
  ...studioTools.map((t) => t.name),
  ...studioExtraTools.map((t) => t.name),
  'social_growth_line_archive', 'social_growth_line_research', 'social_post_update', 'social_post_cancel',
  'social_post_retry', 'social_post_mark_posted',
  'blog_cadence_status', 'social_kill_switch_on', 'social_brand_voice_get', 'social_brand_voice_save',
  'hub_publish_scene',
  'social_post_revise', 'social_post_revisions', 'social_post_revision_status',
  'social_brands', 'social_brand_save', 'social_planner_posts', 'social_posts_reschedule', 'social_analytics_compare', 'social_posts_approve', 'social_posts_cancel',
  'social_queue_slots', 'social_posting_slots_set', 'social_post_recycle', 'social_reports', 'social_report_save', 'social_report_send',
  'social_post_revision_accept', 'social_post_revision_discard',
  'social_approval_mode_get', 'social_approval_mode_set',
  'list_stores', 'use_store', 'account_overview',
  'list_organizations', 'org_overview',
  'marketplace_operator_guide', 'list_subscriptions', 'subscribe_to_supplier',
  'list_deployments', 'list_channel_domains',
  'catalog_operator_guide', 'suggest_catalog', 'create_store', 'create_store_collection',
  'list_store_collections', 'get_store_collection', 'list_collection_products',
  'add_products_to_store', 'add_products_to_collection', 'remove_products_from_collection',
  'collection_banner_options', 'set_store_collection_details',
  'set_store_collection_parent', 'set_store_collection_visibility', 'delete_store_collection',
  'preview_smart_collection', 'create_smart_collection', 'update_smart_collection_rule',
  'list_supplier_collections', 'subscribe_to_supplier_collection',
  'list_supplier_collection_mirrors', 'unsubscribe_supplier_collection',
  'duplicate_collection_to_store', 'duplicate_supplier_collection',
  'sites_operator_guide', 'list_site_logins', 'suggest_site_install', 'unwrap_site_login',
];

const DESTRUCTIVE_TOOLS = ['cancel_booking', 'complete_booking', 'no_show_booking', 'buy_shipping_label'];

test('initialize handshake names lesuto-grok', async () => {
  const res = await handle({ jsonrpc: '2.0', id: 0, method: 'initialize' });
  assert.equal(res.result.serverInfo.name, 'lesuto-grok');
  assert.ok(res.result.protocolVersion);
  assert.equal(res.result.capabilities.tools.listChanged, false);
});

test('ping and notifications', async () => {
  const ping = await handle({ jsonrpc: '2.0', id: 9, method: 'ping' });
  assert.deepEqual(ping.result, {});
  const note = await handle({ jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.equal(note, null);
});

test('unknown method and unknown tool', async () => {
  const missing = await handle({ jsonrpc: '2.0', id: 3, method: 'foo/bar' });
  assert.equal(missing.error.code, -32601);
  const badTool = await handle({
    jsonrpc: '2.0',
    id: 4,
    method: 'tools/call',
    params: { name: 'not_a_tool', arguments: {} },
  });
  assert.equal(badTool.result.isError, true);
  assert.match(badTool.result.content[0].text, /Unknown tool/);
});

test('tools/list is the full merchant surface', async () => {
  const res = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = res.result.tools.map((t) => t.name);
  assert.deepEqual(names.sort(), [...EXPECTED_TOOLS].sort());
  for (const tool of res.result.tools) {
    assert.equal(typeof tool.description, 'string');
    assert.ok(tool.description.length > 10);
    assert.equal(tool.inputSchema.type, 'object');
  }
  const listed = new Set(names);
  for (const t of TOOLS) {
    assert.ok(listed.has(t.name), t.name);
  }
});

test('destructive tools require confirm and advertise the hint', async () => {
  const listed = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  for (const name of DESTRUCTIVE_TOOLS) {
    const meta = listed.result.tools.find((t) => t.name === name);
    assert.equal(meta.annotations.destructiveHint, true, name);
    const denied = await handle({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name, arguments: { id: '1' } },
    });
    assert.equal(denied.result.isError, true, name);
    assert.match(denied.result.content[0].text, /confirm/, name);
  }
});

test('lesuto_graphql refuses key minting without fetching', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, { data: {} }), async (calls) => {
      const denied = await handle({
        jsonrpc: '2.0',
        id: 11,
        method: 'tools/call',
        params: {
          name: 'lesuto_graphql',
          arguments: { query: 'mutation { issueAgentAccessKey { secret } }' },
        },
      });
      assert.equal(denied.result.isError, true);
      assert.match(denied.result.content[0].text, /not permitted/);
      assert.equal(calls.length, 0);
    });
  });
});

test('lesuto_graphql refuses mutations without fetching', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, { data: {} }), async (calls) => {
      const denied = await handle({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'lesuto_graphql',
          arguments: { query: 'mutation { createBookingInvite(input: {}) { id } }' },
        },
      });
      assert.equal(denied.result.isError, true);
      assert.match(denied.result.content[0].text, /read-only/);
      assert.equal(calls.length, 0);
    });
  });
});

test('named read tools call GraphQL through the mock', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.query, /schedulingMeetingTypes|dashboardAnalytics/);
      return jsonResponse(200, { data: { ok: true } });
    }, async (calls) => {
      const meetings = await handle({
        jsonrpc: '2.0',
        id: 7,
        method: 'tools/call',
        params: { name: 'list_meeting_types', arguments: {} },
      });
      assert.equal(meetings.result.isError, undefined);
      const analytics = await handle({
        jsonrpc: '2.0',
        id: 8,
        method: 'tools/call',
        params: { name: 'channel_analytics', arguments: { period: '30d' } },
      });
      assert.equal(analytics.result.isError, undefined);
      assert.equal(calls.length, 2);
    });
  });
});

test('hub_create_scene sends the duration createScene requires', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.query, /createScene/);
      assert.equal(body.variables.input.duration, 14);
      assert.deepEqual(body.variables.input.productIds, ['18755']);
      return jsonResponse(200, { data: { createScene: { id: '51', title: 'T', hubPermalink: 'https://hub.lesuto.com/scenes?id=51' } } });
    }, async (calls) => {
      const res = await handle({
        jsonrpc: '2.0', id: 31, method: 'tools/call',
        params: { name: 'hub_create_scene', arguments: { title: 'T', videoUrl: 'https://cdn.lesuto.com/x.mp4', duration: 13.9, productIds: [18755] } },
      });
      assert.equal(res.result.isError, undefined);
      assert.equal(calls.length, 1);
    });
  });
});

test('hub_create_story posts a store story with tagged products and a capped expiry', async () => {
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(body.query, /createStoreStory/);
      assert.equal(body.variables.mediaType, 'video');
      assert.equal(body.variables.storeId, '243');
      assert.equal(body.variables.expiresInHours, 168);
      assert.deepEqual(body.variables.productIds, ['18758']);
      return jsonResponse(200, { data: { createStoreStory: { id: '9', storeId: '243', mediaType: 'video', productIds: ['18758'], expiresAt: '2026-11-09T00:00:00Z' } } });
    }, async (calls) => {
      const res = await handle({
        jsonrpc: '2.0', id: 32, method: 'tools/call',
        params: { name: 'hub_create_story', arguments: { mediaUrl: 'https://cdn.lesuto.com/s.mp4', storeId: 243, productIds: ['18758'], expiresInHours: 500 } },
      });
      assert.equal(res.result.isError, undefined);
      assert.equal(calls.length, 1);
    });
  });
});
