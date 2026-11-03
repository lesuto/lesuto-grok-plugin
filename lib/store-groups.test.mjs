import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupStores } from './store-groups.mjs';

test('groups stores by company: merchant stores, then each brand with its countries', () => {
  const groups = groupStores([
    { alias: 'L3', channelName: 'Adele Dejak Store', companyName: 'Adele Group', storeKind: 'merchant' },
    { alias: 'L4', channelName: 'Adele Kenya', companyName: 'Adele Group', brandName: 'Adele Dejak', countryCode: 'KE', storeKind: 'brand_country' },
    { alias: 'L1', channelName: 'Adele US', companyName: 'Adele Group', brandName: 'Adele Dejak', countryCode: 'US', storeKind: 'brand_country' },
    { alias: 'L2', channelName: 'Solo Supplier', companyName: '', countryCode: 'GB', storeKind: 'supplier' },
  ]);
  assert.deepEqual(groups, [
    {
      company: 'Adele Group',
      merchantStores: [{ alias: 'L3', channelName: 'Adele Dejak Store' }],
      brands: [{ brand: 'Adele Dejak', countries: [
        { alias: 'L4', channelName: 'Adele Kenya', countryCode: 'KE' },
        { alias: 'L1', channelName: 'Adele US', countryCode: 'US' },
      ] }],
      otherStores: [],
    },
    { company: null, merchantStores: [], brands: [], otherStores: [{ alias: 'L2', channelName: 'Solo Supplier', countryCode: 'GB' }] },
  ]);
});

test('an older admin without grouping fields: every store still listed, in one group', () => {
  const groups = groupStores([{ alias: 'L1', channelName: 'North Shop' }]);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].otherStores, [{ alias: 'L1', channelName: 'North Shop', countryCode: null }]);
});
