import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deniedOp, extractFields } from './lib/denied-ops.mjs';
import { TOOLS } from './server.mjs';
import { commerceTools } from './tools/commerce.mjs';
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

test('tool GraphQL operations are not on the merchant denylist', () => {
  for (const rel of ['tools/connect.mjs', 'tools/commerce.mjs', 'tools/hub.mjs', 'tools/blog.mjs']) {
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

test('skills cover Connect, catalog, orders, and analytics', () => {
  const dir = join(pluginRoot, 'skills');
  const names = readdirSync(dir);
  for (const need of ['lesuto-connect', 'lesuto-catalog', 'lesuto-orders', 'lesuto-analytics']) {
    assert.ok(names.includes(need), need);
    const skill = readFileSync(join(dir, need, 'SKILL.md'), 'utf8');
    assert.match(skill, /api\.lesuto\.com|Lesuto/);
    assert.doesNotMatch(skill, /issueAgentAccessKey/);
    assert.doesNotMatch(skill, /CRM_AGENT_TOKEN/);
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
});
