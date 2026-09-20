import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DENIED_PREFIXES, deniedOp, extractFields, isDestructiveGraphql } from './lib/denied-ops.mjs';
import { pluginRoot } from './test/helpers.mjs';

test('denies staff CRM and key minting field names', () => {
  assert.equal(deniedOp('crmAgentBriefing'), true);
  assert.equal(deniedOp('issueAgentAccessKey'), true);
  assert.equal(deniedOp('rotateAgentAccessKey'), true);
  assert.equal(deniedOp('agentAccessUsage'), true);
  assert.equal(deniedOp('bulkDeleteForPage'), true);
  assert.equal(deniedOp('restoreForPage'), true);
  assert.equal(deniedOp('ListLeads'), true);
  assert.equal(deniedOp('adminLogin'), true);
  assert.equal(deniedOp('createBookingInvite'), false);
  assert.equal(deniedOp('orders'), false);
  assert.equal(deniedOp('dashboardAnalytics'), false);
  assert.equal(deniedOp('me'), false);
});

test('extractFields skips GraphQL keywords', () => {
  const fields = extractFields('query X { createBookingInvite { id } me { id } }');
  assert.ok(fields.includes('createBookingInvite'));
  assert.ok(fields.includes('me'));
  assert.equal(fields.includes('query'), false);
});

test('isDestructiveGraphql only flags listed mutations', () => {
  assert.equal(isDestructiveGraphql('query { orders { totalItems } }'), false);
  assert.equal(isDestructiveGraphql('mutation { createBookingInvite(input: {}) { id } }'), false);
  assert.equal(isDestructiveGraphql('mutation { cancelOrder(id: "1") { id } }'), true);
  assert.equal(isDestructiveGraphql('mutation { refundOrder(id: "1") { id } }'), true);
  assert.equal(isDestructiveGraphql('mutation { deleteProduct(id: "1") { result } }'), true);
});

test('denied prefixes stay in sync with gateway grok.go', () => {
  const goPath = join(pluginRoot, '../api-service/internal/gateway/grok.go');
  if (!existsSync(goPath)) return;
  const go = readFileSync(goPath, 'utf8');
  const block = go.match(/grokDeniedPrefixes = \[\]string\{([\s\S]*?)\}/);
  assert.ok(block, 'grokDeniedPrefixes block');
  const goPrefixes = [...block[1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
  assert.ok(goPrefixes.length > 20);
  const js = new Set(DENIED_PREFIXES);
  const gateway = new Set(goPrefixes);
  for (const prefix of goPrefixes) {
    assert.ok(js.has(prefix), `plugin missing denied prefix ${prefix}`);
  }
  for (const prefix of DENIED_PREFIXES) {
    assert.ok(gateway.has(prefix), `gateway missing denied prefix ${prefix}`);
  }
});
