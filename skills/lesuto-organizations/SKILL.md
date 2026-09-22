---
name: lesuto-organizations
description: Read Lesuto company umbrellas. Use when the merchant asks how the organization, company, or group of businesses is doing, which orgs they belong to, or to roll up revenue across brands.
---

# Lesuto organizations

- Call `list_organizations` first. That is every company this login can see, with role and business count.
- Then `org_overview` with that org id. Periods are `7d`, `30d`, `90d`, or `1y`. Set `includeChildOrgs` when they asked for nested companies too.
- Organization numbers are rollups of revenue and orders. Catalogs, payouts, checkout, and integration credits stay on each business. `creditBalance` on `account_overview` is that store's own balance.
- A company invite is the rollup. Spending a store's credits needs Agent Access on that store (Owner, Store Manager, or AI Agent Access). If that access is removed, the key stops covering that store on the next question.
- `account_overview` is still the right start when the key covers several stores and they did not name a company.
- Do not invent counts. If a field is zero, say so.
