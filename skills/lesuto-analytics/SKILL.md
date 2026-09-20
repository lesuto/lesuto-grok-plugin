---
name: lesuto-analytics
description: Read this Lesuto channel's dashboard numbers. Use for how the store is doing, revenue, order count, average order value, commission, top products, and ads performance.
---

# Lesuto analytics

- Start with `account_overview` when the key covers more than one store. That rolls up revenue, orders, average order value, payouts, leftover credits, and which store grew. Periods are `7d`, `30d`, `90d`, or `1y`. No `use_store` needed.
- For a company umbrella, use `list_organizations` then `org_overview`.
- For one store, use `channel_analytics` after `use_store`. That is the Command Center dashboard: revenue, orders, average order value, commission, supplier payout, return rate, payouts, and top products.
- Orders Read and Full can call those tools. Connect and Catalog Read cannot.
- Catalog Read can still ask product-level numbers through `lesuto_graphql` (`productAnalytics`).
- Full can also ask ads campaign numbers (`campaignAnalytics`) through `lesuto_graphql`.
- Summarize in the merchant's language. Do not invent counts. If a field is zero, say so.
