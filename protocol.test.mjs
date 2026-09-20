import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TOOLS } from './server.mjs';
import { jsonResponse, withAgentEnv, withMockFetch } from './test/helpers.mjs';

const EXPECTED_TOOLS = [
  'lesuto_graphql',
  'list_meeting_types', 'create_booking_invite', 'list_upcoming_bookings',
  'cancel_booking', 'complete_booking', 'no_show_booking',
  'orders_snapshot', 'search_catalog', 'inventory_stock', 'channel_analytics', 'shipping_labels',
  'store_status', 'site_status', 'hub_posts',
  'blog_list', 'blog_get', 'blog_create', 'blog_update', 'blog_publish', 'blog_unpublish', 'blog_delete',
];

const DESTRUCTIVE_TOOLS = ['cancel_booking', 'complete_booking', 'no_show_booking', 'blog_delete'];

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

test('lesuto_graphql destructive mutation requires confirm', async () => {
  await withAgentEnv(async () => {
    await withMockFetch(() => jsonResponse(200, { data: { ok: true } }), async (calls) => {
      const denied = await handle({
        jsonrpc: '2.0',
        id: 5,
        method: 'tools/call',
        params: {
          name: 'lesuto_graphql',
          arguments: { query: 'mutation { refundOrder(id: "1") { id } }' },
        },
      });
      assert.equal(denied.result.isError, true);
      assert.match(denied.result.content[0].text, /confirm/);
      assert.equal(calls.length, 0);

      const ok = await handle({
        jsonrpc: '2.0',
        id: 6,
        method: 'tools/call',
        params: {
          name: 'lesuto_graphql',
          arguments: { query: 'mutation { refundOrder(id: "1") { id } }', confirm: true },
        },
      });
      assert.equal(ok.result.isError, undefined);
      assert.equal(calls.length, 1);
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
