import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

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
  {
    name: 'adjust_variant_stock',
    description: 'Set stock on hand for one product variant. Requires a Fulfillment or All jobs key. Does not change price or other listing fields.',
    inputSchema: {
      type: 'object',
      properties: {
        variantId: { type: 'string' },
        stockOnHand: { type: 'number' },
        stockLocationId: { type: 'string' },
      },
      required: ['variantId', 'stockOnHand'],
    },
    execute: (args) => {
      const qty = Number(args.stockOnHand);
      if (!Number.isInteger(qty) || qty < 0) {
        throw new Error('stockOnHand must be a non-negative integer');
      }
      return adminGraphql(
        `mutation AdjustVariantStock($variantId: ID!, $stockOnHand: Int!, $stockLocationId: ID) { adjustVariantStock(variantId: $variantId, stockOnHand: $stockOnHand, stockLocationId: $stockLocationId) { id sku stockOnHand stockLocationId } }`,
        {
          variantId: String(args.variantId),
          stockOnHand: qty,
          stockLocationId: args.stockLocationId ? String(args.stockLocationId) : null,
        },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'create_shipment',
    description: 'Create a shipment and get carrier rates for an order. Requires a Fulfillment or All jobs key. Buying a label is a separate confirm step.',
    inputSchema: {
      type: 'object',
      properties: { orderId: { type: 'string' } },
      required: ['orderId'],
    },
    execute: (args) => adminGraphql(
      `mutation CreateShipmentForOrder($orderId: ID!) { createShipmentForOrder(orderId: $orderId) { shipmentId rates { rateId carrier service rateCents deliveryDays currency } } }`,
      { orderId: String(args.orderId) },
      { allowWrite: true },
    ),
  },
  {
    name: 'buy_shipping_label',
    description: 'Buy a shipping label. Requires a Fulfillment or All jobs key. This spends postage. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        shipmentId: { type: 'string' },
        rateId: { type: 'string' },
        orderId: { type: 'string' },
        insuranceValueCents: { type: 'number' },
        confirm: { type: 'boolean' },
      },
      required: ['shipmentId', 'rateId', 'orderId'],
    },
    execute: (args) => {
      requireConfirm(args, 'shipping label purchase');
      return adminGraphql(
        `mutation BuyShippingLabel($shipmentId: String!, $rateId: String!, $orderId: ID!, $insuranceValueCents: Int) { buyShippingLabel(shipmentId: $shipmentId, rateId: $rateId, orderId: $orderId, insuranceValueCents: $insuranceValueCents) { shipmentId trackingNumber trackingUrl labelUrl carrier service rateCents insuredValueCents } }`,
        {
          shipmentId: String(args.shipmentId),
          rateId: String(args.rateId),
          orderId: String(args.orderId),
          insuranceValueCents: args.insuranceValueCents == null ? null : Number(args.insuranceValueCents),
        },
        { allowWrite: true },
      );
    },
  },
];
