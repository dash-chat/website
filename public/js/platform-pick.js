/*
  Shared platform detection for /download and /testing.

  Both pages do the same job: ask GitHub for a release, map its assets to
  platform slots, and put the build for the visitor's own platform up front as
  one big button. Only the release they pick (latest stable vs latest
  prerelease) and where mobile visitors are sent (public store vs testing
  programme) differ, so that part stays in the pages — everything else lives
  here so a new asset name or OS quirk is fixed once.

  A native ES module, no build step: the pages import it from their
  <script type="module">. The markup it builds is styled by
  /css/platform-pick.css, which both pages also load.
*/

// Tauri names its artifacts like "Dash.Chat_0.20.1_aarch64.dmg"; the Android
// build comes out as "app-universal-release.apk".
const MATCHERS = {
  mac_arm: (n) => /aarch64\.dmg$/i.test(n),
  mac_intel: (n) => /x64\.dmg$/i.test(n),
  win_exe: (n) => /\.exe$/i.test(n),
  win_msi: (n) => /\.msi$/i.test(n),
  linux: (n) => /\.AppImage$/i.test(n),
  android_apk: (n) => /\.apk$/i.test(n),
};

// iPadOS reports itself as "Macintosh", so the touch-point count is what tells
// an iPad from a Mac.
function detectOS() {
  const ua = navigator.userAgent || "";
  if (/Windows/i.test(ua)) return "win";
  if (/Android/i.test(ua)) return "android";
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Macintosh|Mac OS X/i.test(ua)) return "mac";
  if (/Linux/i.test(ua)) return "linux";
  return "other";
}

export const os = detectOS();

/** Slot -> download URL for every asset the release actually ships. */
export function resolveAssets(release) {
  const assets = release?.assets ?? [];
  const urls = {};
  for (const [slot, matches] of Object.entries(MATCHERS)) {
    const asset = assets.find((a) => matches(a.name));
    if (asset) urls[slot] = asset.browser_download_url;
  }
  return urls;
}

// ---- element builders ---------------------------------------------------
// Release data (asset URLs) is always set as a property or a text node, never
// interpolated into markup.

function div(cls) {
  const d = document.createElement("div");
  d.className = cls;
  d.setAttribute("dir", "auto");
  return d;
}

export function button(href, cls, title, sub) {
  const a = document.createElement("a");
  a.className = `btn ${cls}`;
  a.href = href;
  a.rel = "noopener";
  a.append(title);
  if (sub) {
    const small = document.createElement("small");
    small.textContent = sub;
    a.append(small);
  }
  return a;
}

function caption(text) {
  if (!text) return null;
  const d = div("pc-label");
  d.textContent = text;
  return d;
}

// "<question> <link>." — e.g. "Can’t use the Play Store? Download the APK."
function linkHint(question, href, linkText) {
  const link = document.createElement("a");
  link.href = href;
  link.rel = "noopener";
  link.textContent = linkText;

  const d = div("hint");
  d.append(`${question} `, link, ".");
  return d;
}

function macHint() {
  const strong = document.createElement("strong");
  strong.textContent = "About This Mac";

  const d = div("hint");
  d.append("Not sure?  menu → ", strong,
    ". A chip named M1/M2/M3/M4 is Apple Silicon; “Intel” means Intel.");
  return d;
}

function fill(el, nodes) {
  el.replaceChildren(...nodes.filter(Boolean));
  el.hidden = false;
}

// Only Chromium exposes the CPU architecture, so we never hide either Mac
// build — we just mark the likely one, Apple Silicon unless told otherwise.
async function macArchitecture() {
  const data = navigator.userAgentData;
  if (!data?.getHighEntropyValues) return "arm";
  try {
    const { architecture } = await data.getHighEntropyValues(["architecture"]);
    return architecture === "x86" ? "intel" : "arm";
  } catch {
    return "arm";
  }
}

/**
 * Render the "here's your build" block into `el`.
 *
 * @param {object} opts
 * @param {object} opts.urls          slot -> URL, from resolveAssets()
 * @param {string} opts.fallbackHref  where a button points when its asset is missing
 * @param {string} [opts.desktopLabel] caption above the mac/Windows/Linux button
 * @param {object} [opts.ios]         { href, title, sub, label } — omit to leave iOS uncovered
 * @param {object} [opts.android]     { href, title, sub, label, apkQuestion, apkLinkText }
 *   Either may carry `node` instead: a ready-made <a> to use as the button,
 *   for a page whose store buttons have a look of their own.
 * @returns {Promise<{os: string, covered: boolean}>} covered is false when there
 *   is nothing confident to offer — an unrecognised platform, or a release
 *   carrying no build for it — and `el` is then left untouched for the page.
 */
export async function renderPrimary(el, opts = {}) {
  const { urls = {}, fallbackHref = "#", desktopLabel, ios, android } = opts;
  const picked = { os, covered: true };
  const noPick = { os, covered: false };

  if (os === "mac") {
    if (!urls.mac_arm && !urls.mac_intel) return noPick;

    const armFirst = (await macArchitecture()) !== "intel";
    const chips = div("chip-row");
    chips.append(
      button(urls.mac_arm || fallbackHref, armFirst ? "btn-primary" : "btn-outline",
        "Apple Silicon", `M1–M4${armFirst ? " · recommended" : ""}`),
      button(urls.mac_intel || fallbackHref, armFirst ? "btn-outline" : "btn-primary",
        "Intel", `older Macs${armFirst ? "" : " · recommended"}`),
    );

    // Two buttons always need a word of explanation, whatever the caption says.
    fill(el, [caption(`${desktopLabel || "You’re on a Mac"} — pick your chip`), chips, macHint()]);
    return picked;
  }

  if (os === "win") {
    if (!urls.win_exe && !urls.win_msi) return noPick;

    fill(el, urls.win_exe
      ? [caption(desktopLabel),
         button(urls.win_exe, "btn-primary", "Download for Windows", ".exe installer"),
         urls.win_msi ? linkHint("Prefer an installer package?", urls.win_msi, "Download the .msi") : null]
      : [caption(desktopLabel),
         button(urls.win_msi, "btn-primary", "Download for Windows", ".msi package")]);
    return picked;
  }

  if (os === "linux") {
    if (!urls.linux) return noPick;

    fill(el, [caption(desktopLabel),
      button(urls.linux, "btn-primary", "Download for Linux", "AppImage · x86-64")]);
    return picked;
  }

  if (os === "ios" && ios) {
    fill(el, [caption(ios.label), ios.node || button(ios.href, "btn-primary", ios.title, ios.sub)]);
    return picked;
  }

  if (os === "android" && android) {
    fill(el, [
      caption(android.label),
      android.node || button(android.href, "btn-primary", android.title, android.sub),
      urls.android_apk && android.apkLinkText
        ? linkHint(android.apkQuestion, urls.android_apk, android.apkLinkText)
        : null,
    ]);
    return picked;
  }

  return noPick;
}
