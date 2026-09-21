import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, TOOLS } from './server.mjs';
import { resetStickyStore } from './lib/store-state.mjs';
import { jsonResponse, withAgentEnv, withEnv, withMockFetch } from './test/helpers.mjs';

const STORES = [
  {
    alias: 'L1',
    channelToken: 'merchant_north_admin',
    channelCode: 'merchant_north',
    channelName: 'North Shop',
    scope: 'full',
  },
  {
    alias: 'L2',
    channelToken: 'supplier_south_admin',
    channelCode: 'supplier_south',
    channelName: 'South Supply',
    scope: 'catalog-read',
  },
];

test('list_stores and use_store switch sticky store for later calls', async () => {
  resetStickyStore();
  const list = TOOLS.find((t) => t.name === 'list_stores');
  const use = TOOLS.find((t) => t.name === 'use_store');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      if (String(body.query).includes('accessibleStores')) {
        return jsonResponse(200, { data: { accessibleStores: STORES } });
      }
      assert.equal(init.headers['X-Store'], 'L2');
      assert.equal(init.headers['vendure-token'], 'supplier_south_admin');
      return jsonResponse(200, { data: { me: { id: '1' } } });
    }, async () => {
      const listed = await list.execute({});
      assert.equal(listed.stores.length, 2);
      const switched = await use.execute({ store: 'L2' });
      assert.equal(switched.active, 'L2');
      assert.equal(switched.scope, 'catalog-read');
      const later = await handle({
        jsonrpc: '2.0',
        id: 21,
        method: 'tools/call',
        params: { name: 'lesuto_graphql', arguments: { query: 'query { me { id } }' } },
      });
      assert.match(later.result.content[0].text, /"id": "1"/);
    });
  });
  resetStickyStore();
});

test('account_overview rolls up without a sticky store', async () => {
  resetStickyStore();
  const tool = TOOLS.find((t) => t.name === 'account_overview');
  await withAgentEnv(async () => {
    await withMockFetch((_url, init) => {
      const body = JSON.parse(init.body);
      assert.match(String(body.query), /agentAccountOverview/);
      assert.equal(body.variables.period, '30d');
      assert.equal(init.headers['X-Store'], undefined);
      return jsonResponse(200, {
        data: {
          agentAccountOverview: {
            totalRevenue: 1200,
            totalOrders: 4,
            stores: [{ channelName: 'North Shop', revenue: 1200 }],
          },
        },
      });
    }, async () => {
      const result = await tool.execute({ period: '30d' });
      assert.equal(result.agentAccountOverview.totalRevenue, 1200);
      assert.equal(result.agentAccountOverview.stores.length, 1);
    });
  });
  resetStickyStore();
});

test('use_store accepts channel code and rejects unknown stores', async () => {
  resetStickyStore();
  const use = TOOLS.find((t) => t.name === 'use_store');
  await withEnv({ LESUTO_AGENT_KEY: 'lsk_test_secretvalue', LESUTO_CHANNEL_TOKEN: undefined }, async () => {
    await withMockFetch(() => jsonResponse(200, { data: { accessibleStores: STORES } }), async () => {
      const switched = await use.execute({ store: 'merchant_north' });
      assert.equal(switched.active, 'L1');
      await assert.rejects(() => use.execute({ store: 'nope' }), /not on this key/);
    });
  });
  resetStickyStore();
});
