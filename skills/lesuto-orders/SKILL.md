---
name: lesuto-orders
description: Read and manage orders on this Lesuto Seller channel. Use for lesuto seller orders, fulfillment, and recent sales. Do not treat this as a generic admin panel.
---

# Lesuto orders

- Start with `orders_snapshot` for recent orders.
- Use `channel_analytics` for revenue, order count, average order value, commission, and top products (`7d`, `30d`, `90d`, or `1y`).
- For updates (tracking, status), use `lesuto_graphql` and confirm the write with the merchant first.
- You can only do what this administrator can already do in Lesuto Seller / Command Center on this channel.
- Never mint or revoke agent keys from Grok.
