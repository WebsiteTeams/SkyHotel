# SkyHotel

Billing, inventory, recipes, purchases and reporting for hotels and restaurants.
Next.js 16 (App Router) · TypeScript · Tailwind v4 + shadcn/ui · MongoDB + Mongoose · JWT (jose) cookies · Recharts · React Hook Form + Zod.

## Run it

```bash
npm install
cp .env.example .env.local        # set AUTH_SECRET (32+ chars) and MONGODB_URI

# MongoDB: use Atlas, your own replica set, or the bundled local one:
npm run dev:db                    # leave running; replica set on :27018, data in ./.data/rs

npm run seed                      # creates the hotel, settings and a Super Admin
npm run seed:demo                 # optional: sample menu, stock and recipes
npm run dev                       # http://localhost:3000
```

Default login (from `.env`): `admin@skyhotel.com` / `ChangeMe@123`. **Change it after first sign-in** (Staff page).

Other scripts: `npm run typecheck`, `npm run test:flow` (billing/stock integration test against your DB; it creates and cancels real bills in the DB it is pointed at, so use a dev database).

## How the money and stock rules are enforced

| Rule | Where |
|---|---|
| Server prices every bill; client totals are never trusted (POS shows a server-computed preview) | `services/billing.ts` `priceOrder` |
| Unique invoice numbers, no duplicate bills | `Counter` sequence + unique `idempotencyKey` per bill attempt |
| Stock never goes negative, every change is ledgered | `services/inventory.ts` `moveStock` (conditional `$gte` update + append-only `StockMovement`) |
| Related writes are atomic | `lib/atomic.ts`: Mongo transaction on a replica set; guarded updates + compensating rollback on a standalone `mongod` |
| Cancel reverses stock exactly once, refunds payments, writes audit log | `cancelOrder` (status flip is the single-execution guard) |
| Recipe edits never rewrite history | each order line stores its own consumption snapshot; recipes are versioned |
| Units convert accurately | `lib/units.ts`, stock stored in g / ml / count |
| Financial history is immutable | `Payment`, `StockMovement` reject update/delete at the model layer |
| RBAC on both sides | `lib/rbac.ts`; every route uses `route(permission, …)`; nav and buttons are filtered by the same list |

### Profit methodology
Revenue = taxable value of confirmed bills net of refunds (GST excluded). COGS = ingredient cost consumed at the weighted-average cost at the time of sale. Gross profit = revenue − COGS. Net operating profit = gross profit − wastage − operating expenses. Purchases are **not** subtracted; they become cost only when consumed.


## Cashier access control

- **Effective permissions are computed on the server for every request** (`lib/access.ts` + `route()` in `lib/api.ts`). The JWT only proves identity, so deactivating a user or changing their permissions takes effect on their very next click. Pages are guarded server-side too (`lib/guard.ts`, one `layout.tsx` per protected section).
- **Hotel Admin controls each cashier** under Staff & access: a toggle per permission (`CASHIER_TOGGLES` in `lib/rbac.ts`), discount limits, password reset, activate/deactivate, shift history, sales performance, approvals and the audit log. Only whitelisted permissions can ever be granted (staff, purchases, suppliers, expenses can never be given to a cashier).
- **Discounts:** cashiers have separate percentage and fixed-amount limits (default 10% / Rs 100). Anything above, or when discounts are off, needs a manager's email + approval PIN; the reason and approver are saved on the bill and in the audit log. Managers/admins are unrestricted.
- **Cancel / refund:** cashiers *request* it (reason required). A manager either types their PIN on the spot or approves later from Approvals. Stock is reversed and refunds recorded exactly once; completed invoices are never deleted.
- **Shifts:** with "Open shift" enabled a cashier cannot bill until a shift is open. Expected cash = opening + cash sales - cash refunds; UPI and card are tracked separately. One open shift per cashier (partial unique index).
- **Approval PIN:** each manager/admin sets their own under My Profile. Nobody can set another person's PIN.

Run the access-control test against a running build: `npm run build && npx next start -p 3100`, then `npm run test:rbac`.
After schema/index changes run `npm run db:indexes`.

## Notes
- Uploads (logos, food images, invoices, receipts) are written to `public/uploads`. Use S3/Cloudinary on serverless hosts.
- PDF export uses the browser's print dialog (Save as PDF); CSV is generated client-side.
- Login throttling is in-memory per process; use a shared store when running several instances.
- Live updates use polling (notifications refresh every 60s). Socket.IO needs a custom server and is not wired in.
