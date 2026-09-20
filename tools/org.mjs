import { adminGraphql } from '../lib/graphql.mjs';

export function orgPeriodRange(period) {
  const end = new Date();
  const start = new Date(end);
  const raw = String(period || '30d').toLowerCase();
  if (raw === '7d') start.setUTCDate(end.getUTCDate() - 7);
  else if (raw === '90d') start.setUTCDate(end.getUTCDate() - 90);
  else if (raw === '1y') start.setUTCDate(end.getUTCDate() - 365);
  else if (raw === 'ytd') {
    start.setUTCMonth(0, 1);
    start.setUTCHours(0, 0, 0, 0);
  } else start.setUTCDate(end.getUTCDate() - 30);
  return { startDate: start.toISOString(), endDate: end.toISOString() };
}

export const orgTools = [
  {
    name: 'list_organizations',
    description: 'List the companies this administrator belongs to: name, role, and how many businesses sit under each.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListOrganizations { myOrganizations { id name code role channelCount memberCount parentOrganizationId } }`,
    ),
  },
  {
    name: 'org_overview',
    description: 'Roll up revenue, orders, average order value, active channels, and return rate for one organization. period is 7d, 30d, 90d, 1y, or ytd. Pass includeChildOrgs true to include nested companies.',
    inputSchema: {
      type: 'object',
      properties: {
        orgId: { type: 'string' },
        period: { type: 'string', description: '7d, 30d, 90d, 1y, or ytd' },
        includeChildOrgs: { type: 'boolean' },
      },
      required: ['orgId'],
    },
    execute: (args) => {
      const orgId = String(args.orgId || '').trim();
      if (!orgId) throw new Error('orgId is required');
      const raw = String(args.period || '30d').toLowerCase();
      const period = ['7d', '30d', '90d', '1y', 'ytd'].includes(raw) ? raw : '30d';
      const { startDate, endDate } = orgPeriodRange(period);
      return adminGraphql(
        `query OrgOverview($orgId: ID!, $filters: OrgAnalyticsFiltersInput!) {
          organizationOverview(orgId: $orgId, filters: $filters) {
            totalRevenue
            totalOrders
            avgOrderValue
            activeChannels
            totalReturns
            returnRate
          }
        }`,
        {
          orgId,
          filters: {
            startDate,
            endDate,
            includeChildOrgs: args.includeChildOrgs === true ? true : undefined,
          },
        },
      );
    },
  },
];
