import { adminGraphql } from '../lib/graphql.mjs';
import { requireConfirm } from '../lib/denied-ops.mjs';

export const CATALOG_OPERATOR_GUIDE = `You stock Lesuto stores through named Catalog tools. You do not create SKUs or change prices.

Workflow:
1. list_store_collections with storeId to see aisles on this website. get_store_collection and list_collection_products for one aisle. list_supplier_collection_mirrors for live supplier aisles.
2. suggest_catalog to find home-plan suppliers and products already on the marketplace.
3. create_store when they asked for a new store. Default platform is sdk. Use wordpress only when they named WordPress. Add a Hub store only when they asked for Hub.
4. subscribe_to_supplier (confirm true). Then update routing with the new deployment when they named that store.
5. create_store_collection for a hand-picked aisle on THIS store. Pass storeId. For a child aisle (Craftsman under Home Plans), pass parentId of that store's parent collection so the child is assigned to the same channel. Never reuse another merchant's collection ids. Never pass productIds.
6. For a smart search aisle: preview_smart_collection, then create_smart_collection with a website plus at least one keyword, product type, supplier, or facet. It keeps filling from that website. update_smart_collection_rule to change the search.
7. For a live supplier aisle: list_supplier_collections, then subscribe_to_supplier_collection for one named aisle. That is not dump-the-catalog. unsubscribe_supplier_collection to drop a mirror.
8. add_products_to_store and add_products_to_collection to put products on a manual aisle. remove_products_from_collection to take products off. Do not add or remove products by hand on a smart or mirrored aisle.
9. collection_banner_options then set_store_collection_details to rename, set SEO, or set a banner. set_store_collection_parent to nest or un-nest. set_store_collection_visibility to hide. delete_store_collection to remove an owned aisle. Never call updateMerchantCollection or deleteMerchantCollection.
10. duplicate_collection_to_store copies an aisle onto another website. Products already on that website stay. duplicate_supplier_collection copies a supplier's own aisle. Requires confirm true.
11. Do not call createProduct, updateProduct, createCollection, autoGenerateCollections, updateStoreAutoSync, or mirrorChannelInventory.

Credits: subscribe and store creates are writes. Confirm true is required on those tools.`;

const COLLECTION_FIELDS = `id name slug description isPrivate parentId productCount storeId storeName sourceType isRuleBased isEditable children { id name slug parentId productCount isPrivate }`;

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
    description: 'How to create a store, subscribe a supplier, make and fully manage collections, and add products. Catalog is subscribe plus add-to-store, not createProduct.',
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
    description: 'Create a merchant collection (aisle) on this store. storeId is required. Child aisles must pass parentId so they stay on this channel. Optional featuredAssetId from the library. Do not pass productIds. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        description: { type: 'string' },
        storeId: { type: 'string' },
        parentId: { type: 'string', description: 'Parent aisle id on this store. Required for child style collections.' },
        featuredAssetId: { type: 'string', description: 'Existing library image on this channel' },
        confirm: { type: 'boolean' },
      },
      required: ['name', 'storeId'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection create');
      const name = String(args.name || '').trim();
      const storeId = String(args.storeId || '').trim();
      if (!name) throw new Error('name is required');
      if (!storeId) throw new Error('storeId is required');
      const input = { name, storeId };
      if (args.description) input.description = String(args.description);
      if (args.parentId) input.parentId = String(args.parentId);
      if (args.featuredAssetId) input.featuredAssetId = String(args.featuredAssetId);
      return adminGraphql(
        `mutation CreateStoreCollection($input: CreateMerchantCollectionInput!) {
          createMerchantCollection(input: $input) { ${COLLECTION_FIELDS} }
        }`,
        { input },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'list_store_collections',
    description: 'List owned and supplier aisles on this store. Pass storeId. Read only. Use these ids for parentId, membership, visibility, and delete.',
    inputSchema: {
      type: 'object',
      properties: {
        storeId: { type: 'string' },
        term: { type: 'string' },
        skip: { type: 'number' },
        take: { type: 'number' },
      },
      required: ['storeId'],
    },
    execute: (args) => {
      const storeId = String(args.storeId || '').trim();
      if (!storeId) throw new Error('storeId is required');
      const take = Math.min(Math.max(Number(args.take) || 50, 1), 100);
      const skip = Math.max(Number(args.skip) || 0, 0);
      const term = String(args.term || '').trim().slice(0, 120);
      return adminGraphql(
        `query ListStoreCollections($storeId: ID, $skip: Int, $take: Int, $term: String) {
          merchantCollections(storeId: $storeId, skip: $skip, take: $take, term: $term) {
            ownedTotal supplierTotal ownedProductTotal supplierProductTotal
            ownedCollections { ${COLLECTION_FIELDS} }
            supplierCollections { ${COLLECTION_FIELDS} }
          }
        }`,
        { storeId, skip, take, term: term || null },
      );
    },
  },
  {
    name: 'get_store_collection',
    description: 'Read one aisle on this channel: name, parent, store, product count, children, and whether it is a smart or mirrored aisle. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      return adminGraphql(
        `query GetStoreCollection($collectionId: ID!) {
          merchantCollection(collectionId: $collectionId) { ${COLLECTION_FIELDS} seoTitle seoDescription featuredAsset { id preview } }
        }`,
        { collectionId },
      );
    },
  },
  {
    name: 'list_collection_products',
    description: 'List products already in this aisle. Pass collectionId. Optional term to search inside the aisle. Read only.',
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        term: { type: 'string' },
        skip: { type: 'number' },
        take: { type: 'number' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      const take = Math.min(Math.max(Number(args.take) || 20, 1), 50);
      const skip = Math.max(Number(args.skip) || 0, 0);
      const term = String(args.term || '').trim().slice(0, 120);
      const input = { collectionId, take, skip, groupByProduct: true };
      if (term) input.term = term;
      return adminGraphql(
        `query ListCollectionProducts($input: ChameleonSearchInput!) {
          chameleonSearch(input: $input) { totalItems items { productId productName slug } }
        }`,
        { input },
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
    description: 'Append products to a manual aisle without replacing membership. Use this, not updateMerchantCollection productIds. Requires confirm true.',
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
    name: 'remove_products_from_collection',
    description: 'Remove products from a manual aisle without replacing membership. Do not use on a smart or mirrored aisle. Requires confirm true.',
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
      requireConfirm(args, 'remove products from collection');
      const productIds = Array.isArray(args.productIds) ? args.productIds.map(String) : [];
      if (!productIds.length) throw new Error('productIds is required');
      return adminGraphql(
        `mutation RemoveProductsFromCollection($productIds: [ID!]!, $collectionId: ID!) {
          removeProductsFromCollection(productIds: $productIds, collectionId: $collectionId)
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
    name: 'set_store_collection_parent',
    description: 'Nest an owned aisle under another aisle on this store, or omit parentId to move it to the top. Requires confirm true. Never reuse another merchant\'s collection ids.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        parentId: { type: 'string', description: 'Parent aisle id on this store. Omit or empty to un-nest.' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection parent');
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      const parentRaw = args.parentId != null ? String(args.parentId).trim() : '';
      return adminGraphql(
        `mutation SetStoreCollectionParent($collectionId: ID!, $parentId: ID) {
          setMerchantCollectionParent(collectionId: $collectionId, parentId: $parentId) { ${COLLECTION_FIELDS} }
        }`,
        { collectionId, parentId: parentRaw || null },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'set_store_collection_visibility',
    description: 'Hide or show an owned aisle. isPrivate true hides it from the storefront. Requires confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        isPrivate: { type: 'boolean' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId', 'isPrivate'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection visibility');
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      return adminGraphql(
        `mutation SetStoreCollectionVisibility($collectionId: ID!, $isPrivate: Boolean!) {
          toggleCollectionVisibility(collectionId: $collectionId, isPrivate: $isPrivate) { ${COLLECTION_FIELDS} }
        }`,
        { collectionId, isPrivate: args.isPrivate === true },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'delete_store_collection',
    description: 'Delete an owned aisle on this store. Does not delete products. Requires confirm true. Never call deleteMerchantCollection.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection delete');
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      return adminGraphql(
        `mutation RemoveStoreCollection($collectionId: ID!) {
          removeMerchantCollection(collectionId: $collectionId)
        }`,
        { collectionId },
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
  {
    name: 'list_supplier_collection_mirrors',
    description: 'List live supplier aisle mirrors on this channel. Read only. Use mirror id with unsubscribe_supplier_collection.',
    inputSchema: { type: 'object', properties: {} },
    execute: () => adminGraphql(
      `query ListSupplierCollectionMirrors {
        mySupplierCollectionMirrors {
          id status autoSyncProducts supplierChannelId sourceCollectionId
          mirrorCollection { ${COLLECTION_FIELDS} }
        }
      }`,
    ),
  },
  {
    name: 'unsubscribe_supplier_collection',
    description: 'Drop a live supplier aisle mirror. Requires mirrorId from list_supplier_collection_mirrors and confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        mirrorId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['mirrorId'],
    },
    execute: (args) => {
      requireConfirm(args, 'unsubscribe supplier collection');
      const mirrorId = String(args.mirrorId || '').trim();
      if (!mirrorId) throw new Error('mirrorId is required');
      return adminGraphql(
        `mutation UnsubscribeSupplierCollection($mirrorId: ID!) {
          unsubscribeFromSupplierCollection(mirrorId: $mirrorId)
        }`,
        { mirrorId },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'duplicate_collection_to_store',
    description: 'Copy a collection onto another website. Products already in that store stay. Requires collectionId, targetStoreId, and confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        targetStoreId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId', 'targetStoreId'],
    },
    execute: (args) => {
      requireConfirm(args, 'collection duplicate');
      const collectionId = String(args.collectionId || '').trim();
      const targetStoreId = String(args.targetStoreId || '').trim();
      if (!collectionId || !targetStoreId) throw new Error('collectionId and targetStoreId are required');
      return adminGraphql(
        `mutation DuplicateCollectionToStore($collectionId: ID!, $targetStoreId: ID!) {
          duplicateCollectionToStore(collectionId: $collectionId, targetStoreId: $targetStoreId) {
            id name slug productCount storeId
          }
        }`,
        { collectionId, targetStoreId },
        { allowWrite: true },
      );
    },
  },
  {
    name: 'duplicate_supplier_collection',
    description: 'Copy a supplier aisle on this supplier channel. Requires collectionId and confirm true.',
    destructiveHint: true,
    inputSchema: {
      type: 'object',
      properties: {
        collectionId: { type: 'string' },
        confirm: { type: 'boolean' },
      },
      required: ['collectionId'],
    },
    execute: (args) => {
      requireConfirm(args, 'supplier collection duplicate');
      const collectionId = String(args.collectionId || '').trim();
      if (!collectionId) throw new Error('collectionId is required');
      return adminGraphql(
        `mutation DuplicateSupplierCollection($collectionId: ID!) {
          duplicateSupplierCollection(collectionId: $collectionId) { id name slug productCount }
        }`,
        { collectionId },
        { allowWrite: true },
      );
    },
  },
];
