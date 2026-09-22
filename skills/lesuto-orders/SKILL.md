---
name: lesuto-orders
description: Read and manage orders on this Lesuto Seller channel. Use for lesuto seller orders, fulfillment, and recent sales. Do not treat this as a generic admin panel.
---

# Lesuto orders

- Start with `orders_snapshot` for recent orders.
- Use `channel_analytics` for revenue, order count, average order value, commission, and top products (`7d`, `30d`, `90d`, or `1y`).
- Use `shipping_labels` to read tracking.
- Use `create_shipment` then `buy_shipping_label` (confirm true) to buy postage. That spends money.
- Never refund, cancel, or change prices from Grok.
- Never mint or revoke agent keys from Grok.
