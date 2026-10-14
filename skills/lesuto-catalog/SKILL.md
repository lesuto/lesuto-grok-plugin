---
name: lesuto-catalog
description: Search and inspect this channel catalog on Lesuto Seller. Use for lesuto seller products and catalog. Do not treat this as a generic PIM.
---

# Lesuto catalog

- Use `search_catalog` for product lookup.
- Use `suggest_catalog` for live home-plan suppliers and products.
- Use `create_store`, `create_store_collection`, `preview_smart_collection`, `create_smart_collection`, `update_smart_collection_rule`, `list_supplier_collections`, `subscribe_to_supplier_collection`, `add_products_to_store`, `add_products_to_collection`, `collection_banner_options`, and `set_store_collection_details` when the key has Catalog. Confirm true is required on writes.
- Smart search needs a website plus at least one keyword, product type, supplier, or facet. Never call `autoGenerateCollections` or `updateStoreAutoSync`.
- Set a collection banner from an aisle product (`bannerProductId`) or a library image (`featuredAssetId`). Never call `updateMerchantCollection`.
- Use `subscribe_to_supplier` (confirm true). Do not call `createProduct` or `createCollection`.
- Use `inventory_stock` to read stock on hand.
- Use `adjust_variant_stock` to set stock. That does not change price.
- Use `store_status` to confirm which administrator and channel you are acting as.
- Stay on this channel. Do not try other-channel IDs or platform staff operations.
- This plugin is store work only. It cannot read Lesuto staff CRM, leads, or outreach.
- Do not log into Command Center as the merchant. Operator Chrome seats are a locked administrator, not a Teams invite.
