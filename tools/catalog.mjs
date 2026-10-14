import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const CATALOG_OPERATOR_GUIDE = `You stock Lesuto stores through named Catalog tools. You do not create SKUs or change prices.

Workflow:
1. suggest_catalog to find home-plan suppliers and products already on the marketplace.
2. create_store when they asked for a new store. Default platform is sdk. Use wordpress only when they named WordPress. Add a Hub store only when they asked for Hub.
3. subscribe_to_supplier (confirm true). Then update routing with the new deployment when they named that store.
4. create_store_collection for a hand-picked aisle. Name and description only. Optional featuredAssetId from the library. Never pass productIds.
5. For a smart search aisle: preview_smart_collection, then create_smart_collection with a website plus at least one keyword, product type, supplier, or facet. It keeps filling from that website. update_smart_collection_rule to change the search.
6. For a live supplier aisle: list_supplier_collections, then subscribe_to_supplier_collection for one named aisle. That is not dump-the-catalog.
7. add_products_to_store and add_products_to_collection to put products on a manual aisle. Do not add products by hand to a smart or mirrored aisle.
8. collection_banner_options then set_store_collection_details to rename, set SEO, or set a banner. Never call updateMerchantCollection.
9. Do not call createProduct, updateProduct, createCollection, autoGenerateCollections, updateStoreAutoSync, mirrorChannelInventory, or deleteMerchantCollection.

Credits: subscribe and store creates are writes. Confirm true is required on those tools.`;

function ruleFromArgs(args) {
  const keyword = String(args.keyword || '').trim().slice(0, 120);
  const productTypeCodes = Array.isArray(args.productTypeCodes)
    ? [...new Set(args.productTypeCodes.map(String).map((code) => code.trim()).filter(Boolean))].slice(0, 50)
    : [];
  const supplierChannelIds = Array.isArray(args.supplierChannelIds)
    ? [...new Set(args.supplierChannelIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50)
    : [];
  const facetValueIds = Array.isArray(args.facetValueIds)
    ? [...new Set(args.facetValueIds.map(Number).filter((id) => Number.isInteger(id) && id > 0))].slice(0, 50)
    : [];
  if (!keyword && !productTypeCodes.length && !supplierChannelIds.length && !facetValueIds.length) {
    throw new Error('Add a keyword, product type, supplier, or facet before saving a smart search.');
  }
  const rule = { ruleVersion: 1 };
  if (keyword) rule.keyword = keyword;
  if (productTypeCodes.length) rule.productTypeCodes = productTypeCodes;
  if (supplierChannelIds.length) rule.supplierChannelIds = supplierChannelIds;
  if (facetValueIds.length) rule.facetValueIds = facetValueIds;
  if (args.stockFilter === 'in-stock') rule.stockFilter = 'in-stock';
  return rule;
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'store';
}

export const catalogTools = [
  {
    name: 'catalog_operator_guide',
    description: 'How to create a store, subscribe a supplier, make collections, and add products. Catalog is subscribe plus add-to-store, not createProduct.',
    inputSchema: { type: 'object', properties: {} },
    execute: async () => CATALOG_OPERATOR_GUIDE,
  },
  {
    name: 'suggest_catalog',
    description: 'Search live marketplace suppliers and products. Use for home plans and other catalog setup. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string', description: 'Search term, e.g. home plans' },
        take: { type: 'number' },
      },
    },
    execute: (args) => {
      const term = String(args.term || 'home plans').trim() || 'home plans';
      const take = Math.min(20, Math.max(1, Number(args.take) || 8));
      return adminGraphql(
        `query SuggestCatalog($term: String!, $take: Int) {
          marketplaceSuppliers(filter: { term: $term }) { id code }
          searchMarketplaceProducts(term: $term, limit: $take) {
            totalProducts
            products { productId productName productSlug supplierChannelId supplierName minPrice currencyCode }
          }
        }`,
        { term, take },
      );
    },
  },
  {
    name: 'create_store',
    description: 'Create a Lesuto store (deployment). Default platform is sdk. Use wordpress only when they named WordPress. Optional Hub store when they asked for Hub. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        platform: { type: 'string', description: 'sdk (default), wordpress, or ai-builder' },
        createHub: { type: 'boolean' },
        confirm: { type: 'boolean' },
      },
      required: ['name'],
    },
    execute: async (args) => {
      requireConfirm(args, 'store create');
      const name = String(args.name || '').trim();
      if (!name) throw new Error('name is required');
      const named = String(args.platform || '').toLowerCase();
      const platform = named === 'wordpress' || named === 'ai-builder' ? named : 'sdk';
      const created = await adminGraphql(
        `mutation CreateStore($input: CreateDeploymentConfigInput!) {
          createDeploymentConfig(input: $input) { id name platform siteKey }
        }`,
        { input: { name, platform } },
        { allowWrite: true },
      );
      const deployment = created?.data?.createDeploymentConfig;
      if (!args.createHub || !deployment?.id) return created;
      const hub = await adminGraphql(
        `mutation CreateHubStore($input: CreateHubStoreInput!) {
          createHubStore(input: $input) { id name slug }
        }`,
        {
          input: {
            name,
            slug: slugify(name),
            deploymentConfigId: String(deployment.id),
            siteKey: deployment.siteKey || undefined,
          },
        },
        { allowWrite: true },
      );
      return { store: deployment, hubStore: hub?.data?.createHubStore || null };
    },
  },
  {
    name: 'create_store_collection',
    description: 'Create a merchant collection (aisle) on a store. Name and description only. Optional featuredAssetId from the library. Do not pass productIds. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        storeId: { type: 'string' },
        featuredAssetId: { type: 'string', description: 'Existing library image on this channel' },
        confirm: { type: 'boolean' },
      },
      required: ['name'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection create');
      const name = String(args.name || '').trim();
      if (!name) throw new Error('name is required');
      const input = { name };
      if (args.description) input.description = String(args.description);
      if (args.storeId) input.storeId = String(args.storeId);
      if (args.featuredAssetId) input.featuredAssetId = String(args.featuredAssetId);
      return adminGraphql(
        `mutation CreateStoreCollection($input: CreateMerchantCollectionInput!) {
          createMerchantCollection(input: $input) { id name slug }
        }`,
        { input },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'add_products_to_store',
    description: 'Add existing channel products to a store. Does not create SKUs. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        storeId: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        confirm: { type: 'boolean' },
      },
      required: ['storeId', 'productIds'],
    },
    execute: (args) => {
      requireConfirm(args, 'add products to store');
      const productIds = Array.isArray(args.productIds) ? args.productIds.map(String) : [];
      if (!productIds.length) throw new Error('productIds is required');
      return adminGraphql(
        `mutation AddProductsToStore($storeId: ID!, $productIds: [ID!]!) {
          addProductsToStore(storeId: $storeId, productIds: $productIds)
        }`,
        { storeId: String(args.storeId), productIds },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'add_products_to_collection',
    description: 'Append products to a collection without replacing membership. Use this, not updateMerchantCollection productIds. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        productIds: { type: 'array', items: { type: 'string' } },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId', 'productIds'],
    },
    execute: (args) => {
      requireConfirm(args, 'add products to collection');
      const productIds = Array.isArray(args.productIds) ? args.productIds.map(String) : [];
      if (!productIds.length) throw new Error('productIds is required');
      return adminGraphql(
        `mutation AddProductsToCollection($productIds: [ID!]!, $collectionId: ID!) {
          addProductsToCollection(productIds: $productIds, collectionId: $collectionId)
        }`,
        { productIds, collectionId: String(args.collectionId) },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'collection_banner_options',
    description: 'List aisle product photos and recent library images that can become this collection banner. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
      },
      required: ['collectionId'],
    },
    execute: (args) => adminGraphql(
      `query CollectionBannerOptions($collectionId: ID!) {
        collectionBannerOptions(collectionId: $collectionId) {
          products { assetId label preview productId }
          library { assetId label preview }
        }
      }`,
      { collectionId: String(args.collectionId) },
    ),
  },
  {
    name: 'set_store_collection_details',
    description: 'Rename an aisle, set description or SEO, or set the banner from a library image (featuredAssetId) or a product already in the aisle (bannerProductId). Never sends productIds. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        name: { type: 'string' },
        description: { type: 'string' },
        slug: { type: 'string' },
        seoTitle: { type: 'string' },
        seoDescription: { type: 'string' },
        featuredAssetId: { type: 'string' },
        bannerProductId: { type: 'string' },
        storeId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection details');
      if (args.featuredAssetId && args.bannerProductId) {
        throw new Error('Use featuredAssetId or bannerProductId, not both.');
      }
      const input = { collectionId: String(args.collectionId) };
      for (const key of ['name', 'description', 'slug', 'seoTitle', 'seoDescription', 'featuredAssetId', 'bannerProductId', 'storeId']) {
        if (args[key] != null && String(args[key]).trim() !== '') input[key] = String(args[key]);
      }
      return adminGraphql(
        `mutation SetStoreCollectionDetails($input: SetMerchantCollectionDetailsInput!) {
          setMerchantCollectionDetails(input: $input) { id name slug featuredAsset { id preview } }
        }`,
        { input },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'preview_smart_collection',
    description: 'Count how many products on this website match a smart search. Requires storeId and at least one keyword, product type, supplier, or facet. Read only. Does not dump the catalog.',
    inputSchema: {
      type: 'object',
      properties: {
        storeId: { type: 'string' },
        keyword: { type: 'string' },
        productTypeCodes: { type: 'array', items: { type: 'string' } },
        supplierChannelIds: { type: 'array', items: { type: 'number' } },
        facetValueIds: { type: 'array', items: { type: 'number' } },
        stockFilter: { type: 'string', enum: ['all', 'in-stock'] },
      },
      required: ['storeId'],
    },
    execute: (args) => {
      const storeId = String(args.storeId || '').trim();
      if (!storeId) throw new Error('storeId is required');
      return adminGraphql(
        `query PreviewSmartCollection($ruleDefinition: CollectionRuleInput!, $storeId: ID) {
          previewRuleCollectionCount(ruleDefinition: $ruleDefinition, storeId: $storeId)
        }`,
        { ruleDefinition: ruleFromArgs(args), storeId },
      );
    },
  },
  {
    name: 'create_smart_collection',
    description: 'Create a smart search aisle on a website. It keeps filling from matching products already on that site. Requires name, storeId, confirm true, and at least one keyword, product type, supplier, or facet. Never dumps the whole catalog.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        storeId: { type: 'string' },
        keyword: { type: 'string' },
        productTypeCodes: { type: 'array', items: { type: 'string' } },
        supplierChannelIds: { type: 'array', items: { type: 'number' } },
        facetValueIds: { type: 'array', items: { type: 'number' } },
        stockFilter: { type: 'string', enum: ['all', 'in-stock'] },
        confirm: { type: 'boolean' },
      },
      required: ['name', 'storeId'],
    },
    execute: (args) => {
      requireConfirm(args, 'smart collection');
      const name = String(args.name || '').trim().slice(0, 120);
      const storeId = String(args.storeId || '').trim();
      if (!name) throw new Error('name is required');
      if (!storeId) throw new Error('storeId is required');
      return adminGraphql(
        `mutation CreateSmartCollection($input: CreateRuleCollectionInput!) {
          createRuleBasedCollection(input: $input) { id name slug productCount sourceType isRuleBased storeId }
        }`,
        { input: { name, storeId, ruleDefinition: ruleFromArgs(args) } },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'update_smart_collection_rule',
    description: 'Replace the smart search on an existing aisle. Requires collectionId, confirm true, and at least one keyword, product type, supplier, or facet. Does not send productIds.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        keyword: { type: 'string' },
        productTypeCodes: { type: 'array', items: { type: 'string' } },
        supplierChannelIds: { type: 'array', items: { type: 'number' } },
        facetValueIds: { type: 'array', items: { type: 'number' } },
        stockFilter: { type: 'string', enum: ['all', 'in-stock'] },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'smart collection rule');
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      return adminGraphql(
        `mutation SetSmartCollectionRule($collectionId: ID!, $ruleDefinition: CollectionRuleInput!) {
          setMerchantCollectionRule(collectionId: $collectionId, ruleDefinition: $ruleDefinition) { id name productCount isRuleBased }
        }`,
        { collectionId, ruleDefinition: ruleFromArgs(args) },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'list_supplier_collections',
    description: 'Search named supplier aisles a merchant can mirror. Read only. Does not subscribe.',
    inputSchema: {
      type: 'object',
      properties: {
        term: { type: 'string' },
        skip: { type: 'number' },
        take: { type: 'number' },
      },
    },
    execute: (args) => {
      const take = Math.min(Math.max(Number(args.take) || 20, 1), 50);
      const skip = Math.max(Number(args.skip) || 0, 0);
      const term = String(args.term || '').trim().slice(0, 120);
      return adminGraphql(
        `query SearchSupplierCollections($term: String, $skip: Int, $take: Int) {
          searchSupplierCollections(term: $term, skip: $skip, take: $take) {
            id name productCount supplierChannelId supplierChannelCode supplierName isSubscribed supplierRequiresApproval
          }
        }`,
        { term: term || null, skip, take },
      );
    },
  },
  {
    name: 'subscribe_to_supplier_collection',
    description: 'Mirror one named supplier aisle onto this channel. Requires supplierChannelId, supplierCollectionId, and confirm true. Does not dump the supplier catalog or turn on store-wide auto-sync.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        supplierChannelId: { type: 'string' },
        supplierCollectionId: { type: 'string' },
        autoSyncProducts: { type: 'boolean' },
        confirm: { type: 'boolean' },
      },
      required: ['supplierChannelId', 'supplierCollectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'supplier collection');
      const supplierChannelId = String(args.supplierChannelId || '').trim();
      const supplierCollectionId = String(args.supplierCollectionId || '').trim();
      if (!supplierChannelId || !supplierCollectionId) {
        throw new Error('supplierChannelId and supplierCollectionId are required');
      }
      return adminGraphql(
        `mutation SubscribeToSupplierCollection($supplierChannelId: ID!, $supplierCollectionId: ID!, $autoSyncProducts: Boolean) {
          subscribeToSupplierCollection(
            supplierChannelId: $supplierChannelId
            supplierCollectionId: $supplierCollectionId
            autoSyncProducts: $autoSyncProducts
          ) { id status autoSyncProducts mirrorCollection { id name productCount } }
        }`,
        {
          supplierChannelId,
          supplierCollectionId,
          autoSyncProducts: args.autoSyncProducts !== false,
        },
        { allowWrite: true },
      );
    },
  },
];
