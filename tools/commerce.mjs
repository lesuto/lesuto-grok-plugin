import { adminGraphql } from '../lib/graphql.mjs';

export const commerceTools = [
  {
    name: 'orders_snapshot',
    description: 'Read recent orders for this channel.',
    inputSchema: { type: 'object', properties: { take: { type: 'number' } } },
    execute: (args) => adminGraphql(
      `query OrdersSnapshot($take: Int!) { orders(options: { take: $take, sort: { id: DESC } }) { totalItems items { id code state totalWithTax orderPlacedAt } } }`,
      { take: Math.min(Number(args.take) || 20, 50) },
    ),
  },
  {
    name: 'search_catalog',
    description: 'Search products in this channel catalog.',
    inputSchema: {
      type: 'object',
      properties: { term: { type: 'string' }, take: { type: 'number' } },
      required: ['term'],
    },
    execute: (args) => adminGraphql(
      `query SearchCatalog($term: String, $take: Int) { products(options: { take: $take, filter: { name: { contains: $term } } }) { totalItems items { id name slug enabled } } }`,
      { term: String(args.term || ''), take: Math.min(Number(args.take) || 20, 50) },
    ),
  },
  {
    name: 'inventory_stock',
    description: 'Read stock on hand for products matching a search term.',
    inputSchema: {
      type: 'object',
      properties: { term: { type: 'string' }, take: { type: 'number' } },
      required: ['term'],
    },
    execute: (args) => adminGraphql(
      `query InventoryStock($term: String, $take: Int) { products(options: { take: $take, filter: { name: { contains: $term } } }) { items { id name variants { id sku stockLevels { stockOnHand stockAllocated } } } } }`,
      { term: String(args.term || ''), take: Math.min(Number(args.take) || 10, 25) },
    ),
  },
  {
    name: 'channel_analytics',
    description: 'Read this channel dashboard: revenue, orders, average order value, commission, return rate, and top products. period is 7d, 30d, 90d, or 1y.',
    inputSchema: {
      type: 'object',
      properties: { period: { type: 'string', description: '7d, 30d, 90d, or 1y' } },
    },
    execute: (args) => {
      const raw = String(args.period || '30d').toLowerCase();
      const period = ['7d', '30d', '90d', '1y'].includes(raw) ? raw : '30d';
      return adminGraphql(
        `query ChannelAnalytics($period: String!) {
          dashboardAnalytics(period: $period) {
            totalRevenue
            totalOrders
            avgOrderValue
            totalCommissionEarned
            totalSupplierPayout
            returnRate
            revenueTrend { label value }
            orderCountTrend { label value }
            payoutSummary { held eligible paidOut disputed pending }
            topProducts { productId productName sku unitsSold revenue wishlistCount }
          }
        }`,
        { period },
      );
    },
  },
  {
    name: 'shipping_labels',
    description: 'Read tracking fields on recent orders.',
    inputSchema: { type: 'object', properties: { take: { type: 'number' } } },
    execute: (args) => adminGraphql(
      `query ShippingLabels($take: Int!) { orders(options: { take: $take, sort: { id: DESC } }) { items { id code state fulfillments { id state trackingCode method } } } }`,
      { take: Math.min(Number(args.take) || 20, 50) },
    ),
  },
];
