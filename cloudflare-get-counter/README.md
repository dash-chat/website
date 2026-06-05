# Dash Chat `/get` scan counter — Cloudflare Worker

A tiny Worker that keeps an **aggregate** count of QR-code scans of
`dashchat.org/get`, so we can see which platforms and regions to prioritise —
without ever identifying or locating a visitor.

It collects exactly three things and nothing else:

| field   | example     | source                                   |
| ------- | ----------- | ---------------------------------------- |
| month   | `2026-06`   | server clock, **month only**             |
| country | `IR`        | `request.cf.country` (Cloudflare edge)   |
| device  | `android`   | sent by the `/get` page (collapsed UA)   |

**The raw IP is never read, logged, or stored.** Country is provided by the
Cloudflare edge before our code runs, so the Worker never touches the IP. There
is no per-click row — the only write is an atomic increment of a counter keyed
by `(month, country, device)`. You cannot reconstruct an individual visit from
the data. See [`src/worker.js`](src/worker.js) and [`schema.sql`](schema.sql);
the privacy rules are documented inline as the threat model, not preferences.

## Why this exists separately from the website

`dashchat.org` is hosted on **GitHub Pages**, which is static — it can't run
server code, read the request IP, or set response headers. This Worker is the
small server component that does the geo-lookup-then-discard and the counting.
The `/get` page (static, on GitHub Pages) pings it fire-and-forget; the redirect
happens whether or not the ping succeeds.

## Routes

- `POST /count` — public. Body is the device class (`ios` / `android` /
  `desktop`) as `text/plain`. Always returns `204`. This is what the page's
  `navigator.sendBeacon` hits.
- `GET /stats` — **authenticated** (`Authorization: Bearer <STATS_TOKEN>`).
  Returns aggregated JSON (`byMonth`, `byCountry`, `byDevice`, plus raw rows).
  Read-only. Do not expose the token; counts are for us, not public.

## First-time setup

From this directory (`cloudflare-get-counter/`):

```sh
npm install -g wrangler        # or use npx wrangler ... below
wrangler login

# 1. Create the D1 database, then paste the printed database_id into wrangler.toml
wrangler d1 create dashchat-get-counter

# 2. Create the table (run against the remote/production DB)
wrangler d1 execute dashchat-get-counter --remote --file=./schema.sql

# 3. Set the stats bearer token (pick a long random string; store it in your
#    password manager — this is the credential for GET /stats)
wrangler secret put STATS_TOKEN

# 4. Deploy
wrangler deploy
```

`wrangler deploy` prints the Worker URL, e.g.
`https://dashchat-get-counter.<your-subdomain>.workers.dev`.

## Wire it into the page

Open [`../public/get/index.html`](../public/get/index.html) and set:

```js
var COUNT_ENDPOINT = "https://dashchat-get-counter.<your-subdomain>.workers.dev/count";
```

(replacing the `TODO-your-worker.workers.dev` placeholder). Until that's done the
page simply skips counting — the redirect still works. Then rebuild/deploy the
site as usual.

> Optional: put the Worker on a custom route (e.g. `count.dashchat.org`) via a
> Cloudflare-managed domain if you'd rather not expose a `workers.dev` URL. Not
> required — `workers.dev` is HTTPS-only.

## Reading the counts

```sh
curl -s https://dashchat-get-counter.<your-subdomain>.workers.dev/stats \
  -H "Authorization: Bearer <STATS_TOKEN>" | jq
```

Example response:

```json
{
  "total": 41,
  "byMonth":   { "2026-06": 41 },
  "byCountry": { "IR": 22, "RU": 12, "XX": 7 },
  "byDevice":  { "android": 28, "ios": 9, "desktop": 4 },
  "rows": [
    { "month": "2026-06", "country": "IR", "device": "android", "n": 14 }
  ]
}
```

You can also inspect the table directly:

```sh
wrangler d1 execute dashchat-get-counter --remote \
  --command "SELECT * FROM counts ORDER BY month DESC, n DESC"
```

## What this deliberately does NOT do

Per the brief, these are not missing features — the minimalism is the point. Do
not add them:

- No IP logging, storage, or per-request retention of any kind.
- No full User-Agent, referrer, query params, cookies, ids, or fingerprints.
- No day/hour/minute timestamps — month buckets only.
- No third-party analytics or smart-link services.
- No public counts endpoint.

If a change here looks like it would "improve" the analytics by adding any of
the above, it's wrong — flag it instead.
