import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DENIED_PREFIXES } from './lib/denied-ops.mjs';
import { apiBase, redactSecrets } from './lib/graphql.mjs';
import { deniedOp, extractFields, handle } from './server.mjs';

const root = dirname(fileURLToPath(import.meta.url));

function withApiUrl(url, fn) {
  const prev = process.env.LESUTO_API_URL;
  if (url === undefined) delete process.env.LESUTO_API_URL;
  else process.env.LESUTO_API_URL = url;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env.LESUTO_API_URL;
    else process.env.LESUTO_API_URL = prev;
  }
}

test('never targets admin.lesuto.com', () => {
  const src = readFileSync(join(root, 'server.mjs'), 'utf8');
  const graphql = readFileSync(join(root, 'lib/graphql.mjs'), 'utf8');
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(src, /api\.lesuto\.com/);
  assert.match(src, /never admin\.lesuto\.com/);
  assert.match(graphql, /api\.lesuto\.com/);
  assert.match(readme, /api\.lesuto\.com/);
  assert.equal(src.includes('https://admin.lesuto.com'), false);
  assert.equal(graphql.includes('https://admin.lesuto.com'), false);
  assert.equal(readme.includes('https://admin.lesuto.com'), false);
});

test('apiBase pins https Lesuto API hosts', () => {
  withApiUrl(undefined, () => assert.equal(apiBase(), 'https://api.lesuto.com'));
  withApiUrl('https://api.lesuto.com/', () => assert.equal(apiBase(), 'https://api.lesuto.com'));
  withApiUrl('https://staging-api.lesuto.com', () => assert.equal(apiBase(), 'https://staging-api.lesuto.com'));
  for (const bad of [
    'http://api.lesuto.com',
    'https://admin.lesuto.com',
    'https://127.0.0.1',
    'https://api.lesuto.com.evil.test',
    'https://evil.test',
    'https://user:pass@api.lesuto.com',
    'https://api.lesuto.com/hack',
    'https://api.lesuto.com:8443',
  ]) {
    withApiUrl(bad, () => {
      assert.throws(() => apiBase(), /LESUTO_API_URL/);
    });
  }
});

test('redactSecrets never echoes live env values', () => {
  const prevKey = process.env.LESUTO_AGENT_KEY;
  const prevTok = process.env.LESUTO_CHANNEL_TOKEN;
  process.env.LESUTO_AGENT_KEY = 'lsk_test_secretvalue';
  process.env.LESUTO_CHANNEL_TOKEN = 'merchant_demo_admin';
  try {
    const out = redactSecrets('key=lsk_test_secretvalue token=merchant_demo_admin');
    assert.equal(out.includes('lsk_test_secretvalue'), false);
    assert.equal(out.includes('merchant_demo_admin'), false);
    assert.match(out, /\[redacted\]/);
  } finally {
    if (prevKey === undefined) delete process.env.LESUTO_AGENT_KEY;
    else process.env.LESUTO_AGENT_KEY = prevKey;
    if (prevTok === undefined) delete process.env.LESUTO_CHANNEL_TOKEN;
    else process.env.LESUTO_CHANNEL_TOKEN = prevTok;
  }
});

test('plugin sources do not log agent secrets', () => {
  for (const rel of ['server.mjs', 'lib/graphql.mjs']) {
    const src = readFileSync(join(root, rel), 'utf8');
    assert.equal(/console\.(log|info|debug|error|warn)\([^)]*LESUTO_AGENT_KEY/.test(src), false);
    assert.equal(/stderr\.write\([^)]*LESUTO_AGENT_KEY/.test(src), false);
  }
});

test('denies staff CRM and key minting field names', () => {
  assert.equal(deniedOp('crmAgentBriefing'), true);
  assert.equal(deniedOp('issueAgentAccessKey'), true);
  assert.equal(deniedOp('agentAccessUsage'), true);
  assert.equal(deniedOp('bulkDeleteForPage'), true);
  assert.equal(deniedOp('restoreForPage'), true);
  assert.equal(deniedOp('ListLeads'), true);
  assert.equal(deniedOp('createBookingInvite'), false);
  assert.equal(deniedOp('orders'), false);
});

test('extractFields skips GraphQL keywords', () => {
  const fields = extractFields('query X { createBookingInvite { id } me { id } }');
  assert.ok(fields.includes('createBookingInvite'));
  assert.ok(fields.includes('me'));
});

test('initialize handshake names lesuto-grok', async () => {
  const res = await handle({ jsonrpc: '2.0', id: 0, method: 'initialize' });
  assert.equal(res.result.serverInfo.name, 'lesuto-grok');
  assert.ok(res.result.protocolVersion);
});

test('tools/list includes graphql and connect tools', async () => {
  const res = await handle({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  const names = res.result.tools.map((t) => t.name);
  for (const n of [
    'lesuto_graphql', 'list_meeting_types', 'create_booking_invite',
    'list_upcoming_bookings', 'cancel_booking', 'complete_booking', 'no_show_booking',
    'inventory_stock', 'channel_analytics', 'shipping_labels', 'site_status', 'hub_posts',
    'blog_list', 'blog_get', 'blog_create', 'blog_update', 'blog_publish',
  ]) {
    assert.ok(names.includes(n), n);
  }
});

test('destructive tools require confirm', async () => {
  const res = await handle({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/call',
    params: { name: 'cancel_booking', arguments: { id: '1' } },
  });
  assert.equal(res.result.isError, true);
  assert.match(res.result.content[0].text, /confirm/);
});

test('denied prefixes stay in sync with gateway grok.go', () => {
  const goPath = join(root, '../api-service/internal/gateway/grok.go');
  if (!existsSync(goPath)) return;
  const go = readFileSync(goPath, 'utf8');
  const block = go.match(/grokDeniedPrefixes = \[\]string\{([\s\S]*?)\}/);
  assert.ok(block, 'grokDeniedPrefixes block');
  const goPrefixes = [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(goPrefixes.length > 20);
  const js = new Set(DENIED_PREFIXES);
  for (const prefix of goPrefixes) {
    assert.ok(js.has(prefix), `missing denied prefix ${prefix}`);
  }
});

test('README has logo, signup, and Grok secrets', () => {
  const readme = readFileSync(join(root, 'README.md'), 'utf8');
  assert.match(readme, /assets\/lesuto-mark\.png/);
  assert.match(readme, /https:\/\/www\.lesuto\.com\/signup/);
  assert.match(readme, /LESUTO_AGENT_KEY/);
  assert.match(readme, /LESUTO_CHANNEL_TOKEN/);
  assert.match(readme, /AI Agent Access/);
  assert.match(readme, /Grok Build/);
  assert.match(readme, /Let's Succeed Together/);
  assert.ok(existsSync(join(root, 'assets/lesuto-mark.png')));
});
