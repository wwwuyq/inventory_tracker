# Lili Ops

Private mobile-first operations app for tracking factory orders, inbound shipments, storage, retail purchase orders, invoices, and document intake.

## Run locally

Open `index.html` in a browser. The MVP stores records in browser `localStorage` and can export the database as JSON from the top-right download button.

## Current MVP

- Supabase email/password login for staff.
- Shared Supabase/Postgres `app_state` record so phone, laptop, and staff accounts see the same operations database.
- Mobile-first dashboard for factory balances, inbound quantity, open PO quantity, and stock.
- Master database setup for retail stores, manufacturers, and products.
- Product records can be linked to a default manufacturer and retail store.
- Manufacturing order tracking: ordered, produced, shipped, unit price, paid, and owed.
- Shipment tracking: SKU, quantity, carrier, tracking number, ship date, ETA.
- Storage tracking: received, sent, reserved, available quantity by SKU.
- Retail PO tracking: customer, PO number, ordered, sent, remaining, invoice status.
- Invoice tab for checking whether each PO has been invoiced and when.
- Retail store setup includes a monthly sale-data reminder note for first-day-of-month follow-up.
- Document intake for pasted text and text files, with field extraction for SKU, quantity, price, PO/invoice, tracking, date, and partner.
- PDF/image uploads are logged as documents that need OCR. Production OCR should run server-side.

## Production recommendation

Use this app as the frontend model, then move storage to:

- Supabase Auth for private staff login.
- Supabase Postgres for the operational database.
- Supabase Storage or Cloudflare R2 for PDFs, images, labels, and invoices.
- Server OCR pipeline for PDF/image/Chinese label reading.
- Shopify Admin API sync for products, customers, orders, and invoice-related status.

Suggested domain setup:

- Keep `www.lilidesignstudio.net` on Shopify.
- Host this private app at `ops.lilidesignstudio.net`.
- Add a DNS CNAME for `ops` pointing to the production host, such as Vercel.

## Database tables for production

- `users`
- `products`
- `manufacturers`
- `manufacturing_orders`
- `manufacturing_order_items`
- `payments`
- `shipments`
- `shipment_items`
- `inventory_movements`
- `retail_purchase_orders`
- `retail_purchase_order_items`
- `invoices`
- `documents`
- `ocr_extractions`

The browser app intentionally keeps the same concepts so the data can be migrated later.

See `schema.sql` for a starter Postgres/Supabase schema.

For the current shared-login MVP, paste `supabase-login-state.sql` into Supabase SQL Editor and run it. That creates the shared `app_state` table used by the hosted app.

Paste `supabase-master-tables.sql` into Supabase SQL Editor and run it if you want new retail stores, manufacturers, and products to appear as normal rows in Supabase Table Editor.

## Supabase keys

The app uses only the public project URL and publishable key in `app.js`.

Never put the Supabase `secret` key or `service_role` JWT in frontend files, Vercel public environment variables, GitHub, or chat. Rotate those keys in Supabase if they were exposed.
