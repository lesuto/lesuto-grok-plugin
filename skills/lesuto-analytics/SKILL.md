---
name: lesuto-analytics
description: Read this Lesuto channel's dashboard numbers. Use for how the store is doing, revenue, order count, average order value, commission, top products, and ads performance.
---

# Lesuto analytics

- Start with `account_overview` when the key covers more than one store. That rolls up revenue, orders, average order value, payouts, which store grew, and each store's own `creditBalance`. Periods are `7d`, `30d`, `90d`, or `1y`. No `use_store` needed.
- For a company umbrella, use `list_organizations` then `org_overview`. That rollup is revenue and orders. Credits stay on each store.
- For one store, use `channel_analytics` after `use_store`. That is the Command Center dashboard: revenue, orders, average order value, commission, supplier payout, return rate, payouts, and top products.
- Every key can read those numbers. Use `lesuto_graphql` for extra reads such as `productAnalytics` or `campaignAnalytics`.
- Summarize in the merchant's language. Do not invent counts. If a field is zero, say so.
