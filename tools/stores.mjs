import { adminGraphql } from '../lib/graphql.mjs';
import { getStickyStore, setStickyStore } from '../lib/store-state.mjs';

const STORES_QUERY = `query AccessibleStores {
  accessibleStores { alias channelToken channelCode channelName scope }
}`;

const ACCOUNT_OVERVIEW_QUERY = `query AgentAccountOverview($period: String) {
  agentAccountOverview(period: $period) {
    totalRevenue totalOrders avgOrderValue returnRate
    previousPeriod { totalRevenue totalOrders avgOrderValue revenueChange }
    payoutSummary { held eligible paidOut disputed pending }
    stores { channelId channelCode channelName revenue orders avgOrderValue previousRevenue revenueChange creditBalance }
    topProducts { productName sku revenue unitsSold orders }
  }
}`;

function matchStore(stores, hint) {
  const h = String(hint || '').trim().toLowerCase();
  if (!h) return null;
  return stores.find((s) => (
    String(s.alias || '').toLowerCase() === h
    || String(s.channelCode || '').toLowerCase() === h
    || String(s.channelToken || '').toLowerCase() === h
    || String(s.channelName || '').toLowerCase() === h
  )) || null;
}

export const storeTools = [
  {
    name: 'list_stores',
    description: 'List the Lesuto stores this agent key can use. Each store has an L-code (L1, L2) plus the store name. Call use_store before working a specific store when the key covers more than one.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => {
      const data = await adminGraphql(STORES_QUERY, {}, { requireStore: false });
      const stores = data.accessibleStores || [];
      const active = getStickyStore();
      return {
        stores,
        active: active ? active.alias : (stores.length === 1 ? stores[0].alias : null),
      };
    },
  },
  {
    name: 'use_store',
    description: 'Switch the active Lesuto store for later tool calls. Pass L1, L2, the store code, or the store name from list_stores.',
    inputSchema: {
      type: 'object',
      properties: { store: { type: 'string', description: 'L1, L2, store code, or store name' } },
      required: ['store'],
    },
    execute: async (args) => {
      const hint = String(args.store || args.alias || '').trim();
      if (!hint) throw new Error('Pass store as L1, L2, or the store code.');
      const data = await adminGraphql(STORES_QUERY, {}, { requireStore: false });
      const stores = data.accessibleStores || [];
      const match = matchStore(stores, hint);
      if (!match) {
        throw new Error(`Store '${hint}' is not on this key. Call list_stores.`);
      }
      setStickyStore(match);
      return {
        active: match.alias,
        channelCode: match.channelCode,
        channelName: match.channelName,
        scope: match.scope,
      };
    },
  },
  {
    name: 'account_overview',
    description: 'Revenue, orders, payouts, and each store creditBalance across every store on this key. Each balance belongs to that store. No use_store needed. Period is 7d, 30d, 90d, or 1y.',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', description: '7d, 30d, 90d, or 1y' } },
    },
    execute: async (args) => {
      const period = ['7d', '30d', '90d', '1y'].includes(String(args.period || ''))
        ? String(args.period)
        : '30d';
      return adminGraphql(ACCOUNT_OVERVIEW_QUERY, { period }, { requireStore: false });
    },
  },
];
