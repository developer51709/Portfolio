#!/usr/bin/env node
/**
 * Generates `public/og-image.svg` — the OpenGraph social preview image.
 *
 * The SVG is built from `gitprofile.config.ts` (GitHub username, SEO title,
 * SEO description) and embeds the *current* GitHub profile picture as a data
 * URI, downloaded at generation time from `https://github.com/<user>.png`.
 * This keeps the preview in sync with the live avatar without any manual image
 * editing.
 *
 * Why embed instead of referencing the avatar by URL? The site serves the
 * image as PNG to crawlers via wsrv.nl (`&output=png`), whose rasterizer
 * (libvips/librsvg) deliberately does NOT fetch external images referenced
 * inside SVGs — so the avatar must live inside the file itself.
 *
 * The image is cached by wsrv.nl keyed on the request URL, so the site config
 * appends a `?ts=<build time>` cache-buster to the SVG URL — every build
 * produces a fresh URL and the rendered preview refreshes automatically
 * (e.g. after changing the GitHub avatar).
 *
 * Run manually with:  node scripts/generate-og-image.mjs
 * (Also wired into the `build` script so it regenerates on every build.)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'gitprofile.config.ts');
const outputPath = path.join(root, 'public', 'og-image.svg');

const configSrc = readFileSync(configPath, 'utf8');

/** Extract the body of a top-level object block, e.g. `seo: { ... }`. */
function extractBlock(key) {
  const match = configSrc.match(
    new RegExp(`^\\s*${key}:\\s*\\{([\\s\\S]*?)\\n  \\}`, 'm'),
  );
  if (!match) {
    throw new Error(`Could not find "${key}: { ... }" block in ${configPath}`);
  }
  return match[1];
}

/** Extract a single-quoted string field from a block. */
function extractField(block, key) {
  const match = block.match(new RegExp(`^\\s*${key}:\\s*'([^']*)'`, 'm'));
  if (!match) {
    throw new Error(`Could not find "${key}: '...'" in ${configPath}`);
  }
  return match[1];
}

const username = extractField(extractBlock('github'), 'username');
const seoBlock = extractBlock('seo');
const title = extractField(seoBlock, 'title');
const description = extractField(seoBlock, 'description');

// The SEO title is "<Name> — <Tagline>"; split on the em dash when present.
const [name, tagline] = title.includes('—')
  ? title.split('—').map((part) => part.trim())
  : [title, description];

/** XML-escape text so `&`, `<`, `>` etc. can't break the SVG. */
const esc = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');

/**
 * Download the current GitHub avatar. Returns a self-contained
 * `data:<type>;base64,` URI, or the live URL as a fallback if the download
 * fails (e.g. an offline build) — browsers still render it either way.
 */
async function buildAvatarSource() {
  try {
    // Bound the request: publish/build sandboxes may have no egress, and an
    // unbounded fetch would hang the whole build instead of using the fallback.
    const res = await fetch(
      `https://github.com/${encodeURIComponent(username)}.png?size=512`,
      { redirect: 'follow', signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) throw new Error(`GitHub avatar fetch failed: ${res.status}`);
    const bytes = Buffer.from(await res.arrayBuffer());
    if (bytes.length === 0 || bytes.length > 2_000_000) {
      throw new Error(`Unexpected avatar payload (${bytes.length} bytes)`);
    }
    const type = res.headers.get('content-type') || 'image/png';
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch (err) {
    console.warn(`[og-image] ${err.message} — using live avatar URL fallback`);
    return `https://github.com/${encodeURIComponent(username)}.png?size=512`;
  }
}

const avatarSource = await buildAvatarSource();
const fontStack =
  "'Inter', ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#0b0b11"/>
      <stop offset="1" stop-color="#040407"/>
    </linearGradient>
    <radialGradient id="avatarGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#4f7cff" stop-opacity="0.22"/>
      <stop offset="1" stop-color="#4f7cff" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="cornerGlow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0" stop-color="#7c5cff" stop-opacity="0.14"/>
      <stop offset="1" stop-color="#7c5cff" stop-opacity="0"/>
    </radialGradient>
    <clipPath id="avatarClip">
      <circle cx="330" cy="315" r="150"/>
    </clipPath>
  </defs>

  <rect width="1200" height="630" fill="url(#bg)"/>
  <circle cx="330" cy="315" r="430" fill="url(#avatarGlow)"/>
  <circle cx="1060" cy="70" r="300" fill="url(#cornerGlow)"/>

  <!-- GitHub profile picture (embedded at build time — always the current avatar) -->
  <circle cx="330" cy="315" r="152" fill="#0e0e14"/>
  <image href="${avatarSource}" xlink:href="${avatarSource}" x="180" y="165" width="300" height="300" clip-path="url(#avatarClip)" preserveAspectRatio="xMidYMid slice"/>
  <circle cx="330" cy="315" r="152" fill="none" stroke="#ffffff" stroke-opacity="0.16" stroke-width="4"/>

  <!-- Text -->
  <text x="560" y="272" font-family="${fontStack}" font-size="80" font-weight="700" fill="#fafafa">${esc(name)}</text>
  <text x="562" y="340" font-family="${fontStack}" font-size="30" fill="#9ca3af">${esc(tagline)}</text>
  <text x="562" y="400" font-family="${fontStack}" font-size="28" font-weight="600" fill="#4f7cff">github.com/${esc(username)}</text>

  <!-- <text x="1110" y="586" text-anchor="end" font-family="${fontStack}" font-size="22" fill="#6b7280">${esc(name)}'s Portfolio</text> -->
</svg>
`;

writeFileSync(outputPath, svg);
console.log(
  `Generated ${path.relative(root, outputPath)} (username: ${username}, name: ${name}, avatar embedded: ${avatarSource.startsWith('data:')})`,
);
