# Roatán Private Yacht Getaways

Booking site, guest app and admin for the yacht line of **Love Cloud Tours & Weddings**.
Replaces the Rezdy catalog with something that can sell extras, run promos, take
payment and issue invoices.

```bash
npm install
npm start          # → http://localhost:3000
```

Admin is at `/admin.html`. The default password is `lovecloud` — change it with
`ADMIN_PASSWORD` before anyone else can reach the site.

The boat is **Knotty**, a 47-foot two-stateroom express cruiser out of French
Harbour. Her photographs are in `public/media` and drive the fleet cards, the
packages, the deck plan and the gallery.

## What is here

| Page | What it does |
| --- | --- |
| `/` | The whole guest flow: occasion, vessel, calendar, deck plan, manifest, pay |
| `/confirmation.html?ref=LC-1001` | Booking confirmation and boarding pass |
| `/lookup.html` | Guest looks up an existing booking by reference |
| `/invoice.html?n=INV-101` | Public invoice with a pay button, printable to PDF |
| `/admin.html` | Bookings, catalog, promos, calendar, invoices, numbers, settings |

## Configuration

Copy `.env.example` to `.env`. Everything is optional — with no configuration at
all the app runs in **quote mode**: bookings are taken and confirmed, but instead
of a card form the guest is told an invoice is coming. That is what makes it
demoable before the Stripe account exists.

| Variable | Purpose |
| --- | --- |
| `ADMIN_PASSWORD` | Admin sign-in. Set this. |
| `STRIPE_SECRET_KEY` | Switches on card payments and invoice payment links |
| `STRIPE_WEBHOOK_SECRET` | Required to mark bookings paid automatically |
| `RESEND_API_KEY` | Sends confirmations and invoices for real. Without it they print to the log |
| `MAIL_FROM` | The address guests see. Must be a domain verified in Resend |
| `PUBLIC_URL` | Canonical origin used in Stripe redirects and invoice links |
| `DATA_DIR` | Where `db.json` lives (default: `./data`) |
| `PORT` | Default 3000 |

### Turning on Stripe

1. Create the Stripe account under the **US entity** — Stripe does not support
   businesses registered in Honduras.
2. Put the secret key in `STRIPE_SECRET_KEY`.
3. Add a webhook endpoint pointing at `https://your-domain/api/webhooks/stripe`,
   subscribed to `checkout.session.completed`, and put its signing secret in
   `STRIPE_WEBHOOK_SECRET`.

Until step 3 is done, payments will go through but bookings will not flip to
"paid" on their own — mark them by hand in the admin.

## How it is put together

```
server/
  index.js       routes: public catalog/quote/booking, admin CRUD, stripe webhook
  pricing.js     the only place a total is calculated
  payments.js    payment provider seam — Stripe today, PayPal drops in beside it
  notify.js      email and WhatsApp — Resend when configured, the log when not
  store.js       storage seam — JSON file today, Postgres later
  seed-data.js   the five real Rezdy products, the extras catalog, the bundles
public/          the guest app and the admin, no build step
```

Three rules the code follows:

- **The browser never sets a price.** It draws a running total so the builder
  feels alive, but every quote and every charge is re-priced on the server from
  the catalog.
- **Providers sit behind a seam.** Swapping Stripe for PayPal, or the JSON file
  for Postgres, means writing one adapter — not touching the booking flow.
- **An unpaid booking does not own a date forever.** A card checkout holds the
  dates for 30 minutes; abandon it and the date frees itself. Promo codes are
  spent when the money lands, not when the form is submitted.

## Known limits before a real launch

These are fine for a demo and for a first quiet week. They are not fine for a
busy season, and each one is a small, contained job:

1. **Storage is a JSON file.** On Vercel's serverless filesystem writes do not
   persist — the admin shows a red banner when it detects this. Move `store.js`
   to Postgres (Supabase) before taking real money.
2. **Admin sessions live in memory.** They reset when the server restarts, and
   across multiple serverless instances a sign-in may not stick. Fine on a single
   long-running host; needs a signed cookie or a session table otherwise. Login
   is rate-limited to six tries per IP per fifteen minutes.
3. **Email needs a key and a verified domain.** The messages are written and
   tested; set `RESEND_API_KEY` and verify the sending domain and they go out.
   Until then every one prints to the server log, and the admin says so.
4. **WhatsApp is a link, not an integration.** Each booking and invoice produces
   a `wa.me` link with the message pre-written for the crew to send. Automatic
   sending needs the WhatsApp Business API, an approved template and a verified
   number — worth doing, but not on the critical path.
5. **The speedboat has no photograph.** Knotty is shot properly; the speedboat
   still falls back to a line drawing. Drop a photo in `public/media` and point
   the vessel's `photo` field at it from the admin.
6. **English only.** The copy is written in English on purpose; a Spanish
   translation is a straightforward addition when you want it.

## Deploying

`vercel.json` in this folder deploys the app standalone. Set the environment
variables in the Vercel dashboard, and read limit #1 above before pointing a
real domain at it.
