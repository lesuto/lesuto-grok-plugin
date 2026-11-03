/**
 * An agent key's stores grouped like the seller's store switcher: each company, its merchant stores,
 * then each brand with its countries; stores in no company last. The server already orders them
 * (accessibleStores); this only nests them. Aliases (L1, L2) are unchanged.
 */
export function groupStores(stores) {
  const companies = new Map();
  const group = (name) => {
    if (!companies.has(name)) companies.set(name, { company: name || null, merchantStores: [], brands: [], otherStores: [] });
    return companies.get(name);
  };
  for (const store of stores) {
    const entry = { alias: store.alias, channelName: store.channelName };
    const g = group(store.companyName || '');
    if (store.storeKind === 'merchant') {
      g.merchantStores.push(entry);
    } else if (store.storeKind === 'brand_country' && store.brandName) {
      let brand = g.brands.find((b) => b.brand === store.brandName);
      if (!brand) {
        brand = { brand: store.brandName, countries: [] };
        g.brands.push(brand);
      }
      brand.countries.push({ ...entry, countryCode: store.countryCode || null });
    } else {
      g.otherStores.push({ ...entry, countryCode: store.countryCode || null });
    }
  }
  return [...companies.values()];
}
