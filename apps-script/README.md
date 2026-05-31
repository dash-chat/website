# Form backend — Cloudflare Turnstile + Google Apps Script

The "Get involved" form on `index.html` is protected by [Cloudflare
Turnstile](https://www.cloudflare.com/products/turnstile/) and submits to a
Google Apps Script web app, which verifies the captcha **server-side** and
appends each submission to a Google Sheet (and can email a notification).

There is no third-party form vendor: you own the Turnstile keys (Cloudflare)
and the Sheet + script (Google).

## One-time setup

### 1. Create the Turnstile widget (Cloudflare)

1. Cloudflare dashboard → **Turnstile** → **Add widget**.
2. Name it (e.g. `dashchat.org`), add hostnames: `dashchat.org`,
   `www.dashchat.org`, and `localhost` (for local testing).
3. Widget mode: **Managed** is fine.
4. Copy the **Site Key** (public) and **Secret Key** (private).

### 2. Create the Sheet + Apps Script

1. Create a new Google Sheet (this is where submissions land).
2. In the Sheet: **Extensions → Apps Script**.
3. Replace the default `Code.gs` with the contents of [`Code.gs`](./Code.gs).
4. **Project Settings (gear) → Script Properties → Add script property:**
   - `TURNSTILE_SECRET` = the Turnstile **secret** key (required)
   - `NOTIFY_EMAIL` = an address to email each submission to (optional)
5. **Deploy → New deployment → Web app**:
   - **Execute as:** Me
   - **Who has access:** Anyone
   - Deploy, authorize when prompted, and copy the **Web app URL**
     (ends in `/exec`).

### 3. Wire the site to your keys

In `index.html`, replace the two placeholders:

- `__TURNSTILE_SITE_KEY__` → your Turnstile **site** key
- `__APPS_SCRIPT_URL__` → the Apps Script web app `/exec` URL

(Or send both values to whoever maintains the site and they'll fill them in.)

## Updating the script later

Apps Script web apps are versioned. After editing `Code.gs`, go to
**Deploy → Manage deployments → (edit) → New version → Deploy**. The `/exec`
URL stays the same, so no site change is needed.

## Local testing

Cloudflare publishes [test keys](https://developers.cloudflare.com/turnstile/troubleshooting/testing/)
that always pass — handy for checking the widget renders before you have real
keys:

- Site key (always passes, visible): `1x00000000000000000000AA`
- Secret key (always passes): `1x0000000000000000000000000000000AA`

End-to-end submission still requires the real Apps Script URL.

## Notes

- The browser POSTs with `mode: 'no-cors'` because Apps Script web apps don't
  send CORS headers. The request reaches the server and the row is written, but
  the response is opaque to the page — so the UI shows success on completion and
  relies on the **server-side** Turnstile check (in `Code.gs`) to reject bots.
- The form fields written to the Sheet: timestamp, email, name, newsletter,
  test, partner, details.
