/**
 * Dash Chat — /get aggregate scan counter (Cloudflare Worker)
 * ==========================================================
 *
 * Counts QR-code scans of dashchat.org/get by (month, country, device) and
 * NOTHING else. This is the privacy threat model from the brief, encoded:
 *
 *   - The raw IP is NEVER read, logged, or stored. Country comes from the
 *     Cloudflare edge (`request.cf.country`), which is computed before our
 *     code runs, so this Worker never touches the IP at all. We deliberately
 *     do not read `cf-connecting-ip` or any IP header anywhere below.
 *   - The full User-Agent is NEVER read or stored. The browser sends only the
 *     collapsed device class ("ios" | "android" | "desktop") in the body.
 *   - There is NO per-click row. The only write is an atomic increment of an
 *     aggregate counter keyed by (month, country, device). An individual visit
 *     cannot be reconstructed from this data — by design.
 *   - Time resolution is the month bucket (YYYY-MM) only. No day, no timestamp.
 *   - No cookies, no ids, no logging.
 *
 * Two routes:
 *   POST /count   public, fire-and-forget beacon from the /get page. 204.
 *   GET  /stats   authenticated (Bearer STATS_TOKEN), read-only aggregates.
 *
 * Storage: D1 (SQLite). D1 gives atomic UPSERT increments, so concurrent
 * scans don't lose counts (Workers KV would race on read-modify-write).
 */

const ALLOWED_DEVICES = new Set(["ios", "android", "desktop"]);

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "POST" && url.pathname === "/count") {
      return handleCount(request, env);
    }
    if (request.method === "GET" && url.pathname === "/stats") {
      return handleStats(request, env);
    }
    // CORS preflight is not expected (the beacon is a CORS-simple request),
    // but answer OPTIONS cleanly just in case a browser sends one.
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }
    return new Response("Not found", { status: 404 });
  },
};

/** Current month bucket, e.g. "2026-06". Month only — never a finer timestamp. */
function monthBucket() {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function handleCount(request, env) {
  // The response is opaque to the beacon; we always return 204 so a failed
  // write can never surface to (or block) the visitor's redirect.
  try {
    // Device class is the ONLY thing the client sends. Read at most a few
    // bytes and validate against the allow-list; anything else is dropped.
    const raw = (await request.text()).trim().toLowerCase();
    if (!ALLOWED_DEVICES.has(raw)) {
      return new Response(null, { status: 204, headers: corsHeaders() });
    }

    // Country from the edge. `request.cf.country` is "XX" for unknown / Tor in
    // some cases; store it as-is (still aggregate, still no IP). We never read
    // the IP that produced it.
    const country = (request.cf && request.cf.country) || "XX";
    const month = monthBucket();

    // Atomic aggregate increment. No per-click row is ever inserted.
    await env.DB.prepare(
      `INSERT INTO counts (month, country, device, n)
       VALUES (?1, ?2, ?3, 1)
       ON CONFLICT(month, country, device)
       DO UPDATE SET n = n + 1`
    )
      .bind(month, country, device(raw))
      .run();
  } catch (e) {
    // Swallow — analytics must never break the redirect, and we log nothing
    // (logging could capture request metadata we've promised not to retain).
  }
  return new Response(null, { status: 204, headers: corsHeaders() });
}

// Indirection kept tiny and explicit so it's obvious only the class is stored.
function device(d) {
  return d; // already validated against ALLOWED_DEVICES
}

async function handleStats(request, env) {
  const auth = request.headers.get("authorization") || "";
  const expected = `Bearer ${env.STATS_TOKEN}`;
  // Constant-time-ish compare; tokens are short and this endpoint is low-traffic.
  if (!env.STATS_TOKEN || !timingSafeEqual(auth, expected)) {
    return new Response("Unauthorized", {
      status: 401,
      headers: { "WWW-Authenticate": "Bearer" },
    });
  }

  // Read-only. Return the raw aggregate table plus convenience roll-ups.
  const rows = (
    await env.DB.prepare(
      `SELECT month, country, device, n FROM counts
       ORDER BY month DESC, n DESC, country ASC, device ASC`
    ).all()
  ).results;

  const byCountry = rollup(rows, (r) => r.country);
  const byDevice = rollup(rows, (r) => r.device);
  const byMonth = rollup(rows, (r) => r.month);

  return Response.json(
    { total: rows.reduce((s, r) => s + r.n, 0), byMonth, byCountry, byDevice, rows },
    { headers: { "Cache-Control": "no-store" } }
  );
}

function rollup(rows, keyFn) {
  const out = {};
  for (const r of rows) {
    const k = keyFn(r);
    out[k] = (out[k] || 0) + r.n;
  }
  return out;
}

function corsHeaders() {
  // The beacon never reads the response, so this is belt-and-suspenders only.
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}
