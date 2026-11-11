#!/usr/bin/env node
/**
 * LLC AI LABS — static site generator
 * Zero dependencies. Deterministic: same input -> byte-identical output.
 * Writes only into docs/ (GitHub Pages legacy source: main:/docs).
 *
 * Usage:  node build.mjs [--check]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
if (!fs.existsSync(path.join(ROOT, 'products.json')) || !fs.existsSync(path.join(ROOT, 'docs'))) {
  console.error('build.mjs must be run from the repository root (needs products.json and docs/).');
  process.exit(1);
}
const DOCS = path.join(ROOT, 'docs');
const SRC = path.join(ROOT, 'src');
const DOMAIN = 'https://llcailabs.com';
const OG_IMAGE = `${DOMAIN}/assets/og/default.png`;
const BRAND = 'LLC AI LABS';
const CHECK = process.argv.includes('--check');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));
const written = [];

/* Contact addresses. Confirmed by the site owner on 2026-11-11; business has
   no confirmed mailbox yet, so it must never be invented. */
const CONTACT = (data.brand && data.brand.contact) || {};
if (!CONTACT.supportEmail || !CONTACT.privacyEmail) {
  throw new Error('products.json: brand.contact.supportEmail / privacyEmail required');
}
const mailto = (addr, subject) => `mailto:${addr}?subject=${encodeURIComponent(subject)}`;
const errors = [];

/* ---------------------------------------------------------------- helpers */
const esc = (s = '') => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

function out(relPath, content) {
  const abs = path.join(DOCS, relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const buf = Buffer.from(content, 'utf8');
  if (CHECK) {
    const prev = fs.existsSync(abs) ? fs.readFileSync(abs) : null;
    if (!prev || !prev.equals(buf)) errors.push(`STALE: ${relPath}`);
  } else {
    fs.writeFileSync(abs, buf);
  }
  written.push({ path: relPath, bytes: buf.length, sha256: crypto.createHash('sha256').update(buf).digest('hex') });
}

const assetsCache = new Map();
function productAssets(slug) {
  if (assetsCache.has(slug)) return assetsCache.get(slug);
  const dir = path.join(DOCS, 'assets', 'products', slug);
  const res = { icon: null, shots: [] };
  if (fs.existsSync(dir)) {
    const files = fs.readdirSync(dir).sort();
    for (const f of files) {
      const url = `/assets/products/${slug}/${f}`;
      if (f.startsWith('icon-512')) { if (!res.icon) res.icon = url; }
      else if (f.startsWith('shot-')) res.shots.push(url);
    }
  }
  assetsCache.set(slug, res);
  return res;
}

/* --------------------------------------------------------------- templates */
const NAV = [
  ['/apps/', 'Apps'],
  ['/games/', 'Games'],
  ['/extensions/', 'Extensions'],
  ['/support/', 'Support'],
  ['/privacy/', 'Privacy'],
];

const ICON = {
  check: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10.5l4 4 8-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  shield: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5l6 2.4v4.9c0 3.6-2.4 6.3-6 7.7-3.6-1.4-6-4.1-6-7.7V4.9l6-2.4z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>',
  play: '<svg viewBox="0 0 20 20" aria-hidden="true" fill="currentColor"><path d="M4.2 2.4l9.4 7.6-9.4 7.6c-.2-.2-.3-.5-.3-.9V3.3c0-.4.1-.7.3-.9zm10.5 6.4l2.6 1.3c.6.3.6 1.1 0 1.4l-2.6 1.3-2.4-2 2.4-2zM5.4 1.9l7.6 6.1-2.2 1.5L5.4 1.9zm0 16.2l5.4-7.6 2.2 1.5-7.6 6.1z"/></svg>',
  arrow: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M4 10h11M11 5.5l4.5 4.5-4.5 4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  device: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><rect x="5" y="2" width="10" height="16" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M9 15.5h2" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  puzzle: '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M7 3.5a1.8 1.8 0 013.6 0V5h2.2A1.8 1.8 0 0114 6.8h1.3a1.8 1.8 0 010 3.6H14v2.4a1.8 1.8 0 01-1.8 1.8H10v1.3a1.8 1.8 0 01-3.6 0V14H4.8A1.8 1.8 0 013 12.2V9.8h1.3a1.8 1.8 0 000-3.6H3V4.8A1.8 1.8 0 014.8 3H7v.5z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/></svg>',
};

function head({ title, description, canonicalPath, ogTitle, ogType = 'website', jsonld, noindex }) {
  const canonical = `${DOMAIN}${canonicalPath}`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(description)}">
  <meta name="robots" content="${noindex ? 'noindex, follow' : 'index, follow'}">
  <link rel="canonical" href="${canonical}">
  <meta property="og:site_name" content="${BRAND}">
  <meta property="og:title" content="${esc(ogTitle || title)}">
  <meta property="og:description" content="${esc(description)}">
  <meta property="og:type" content="${ogType}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${OG_IMAGE}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:image:alt" content="${esc(ogTitle || title)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(ogTitle || title)}">
  <meta name="twitter:description" content="${esc(description)}">
  <meta name="twitter:image" content="${OG_IMAGE}">
  <link rel="icon" type="image/svg+xml" href="/assets/favicon.svg">
  <link rel="stylesheet" href="/assets/styles.css">${jsonld ? `\n  <script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ''}
</head>`;
}

function header(current) {
  return `<body>
  <a class="skip-link" href="#main">Skip to content</a>
  <header class="site-header">
    <div class="container site-header__inner">
      <a class="site-brand" href="/" aria-label="${BRAND} home">
        <img class="site-brand__mark" src="/assets/favicon.svg" alt="" width="30" height="30">
        <span class="site-brand__name">${BRAND}</span>
      </a>
      <nav class="site-nav" aria-label="Primary">
${NAV.map(([href, label]) => `        <a href="${href}"${current === href ? ' aria-current="page"' : ''}>${label}</a>`).join('\n')}
        <a class="site-nav__cta" href="/contact/"${current === '/contact/' ? ' aria-current="page"' : ''}>Contact</a>
      </nav>
    </div>
  </header>
  <main id="main">`;
}

function footer() {
  return `  </main>
  <footer class="site-footer">
    <div class="container site-footer__inner">
      <div class="site-footer__brand">
        <a class="site-brand" href="/">
          <img class="site-brand__mark" src="/assets/favicon.svg" alt="" width="30" height="30">
          <span class="site-brand__name">${BRAND}</span>
        </a>
        <p>${data.brand.positioning}. Building small, focused Android apps, games and Chrome extensions that simplify everyday tasks.</p>
      </div>
      <div class="site-footer__col">
        <h3>Products</h3>
        <ul>
          <li><a href="/apps/">Apps</a></li>
          <li><a href="/games/">Games</a></li>
          <li><a href="/extensions/">Extensions</a></li>
          <li><a href="${data.brand.playDeveloperUrl}" rel="noopener">Google Play developer page</a></li>
        </ul>
      </div>
      <div class="site-footer__col">
        <h3>Support</h3>
        <ul>
          <li><a href="/support/">Help &amp; support</a></li>
          <li><a href="/data-deletion/">Data deletion</a></li>
          <li><a href="/contact/">Contact</a></li>
        </ul>
      </div>
      <div class="site-footer__col">
        <h3>Legal</h3>
        <ul>
          <li><a href="/privacy/">Privacy policy</a></li>
          <li><a href="/terms/">Terms of use</a></li>
          <li><a href="/privacy/">App-specific policies</a></li>
        </ul>
      </div>
    </div>
    <div class="container site-footer__legal">
      <span>&copy; <span id="year">2026</span> ${BRAND}. All rights reserved.</span>
      <span>Apps and games are distributed via Google Play.</span>
    </div>
    <script>var y=document.getElementById('year');if(y){y.textContent=new Date().getFullYear();}</script>
  </footer>
</body>
</html>`;
}

function storeButton(p, size = '') {
  const cls = `btn btn--store${size ? ' ' + size : ''}`;
  return `<a class="${cls}" href="${esc(p.playUrl)}" rel="noopener">${ICON.play} Google Play</a>`;
}

function card(p, { withShot = false } = {}) {
  const a = productAssets(p.slug);
  const href = `/${p.section}/${p.slug}/`;
  return `        <article class="card${withShot && a.shots.length ? ' card--media' : ''}">
${withShot && a.shots.length ? `          <img class="card__shot" src="${a.shots[0]}" alt="Screenshot of ${esc(p.name)}" loading="lazy" decoding="async">` : ''}
          <div class="card__head">
            <img class="card__icon" src="${a.icon}" alt="${esc(p.name)} app icon" width="54" height="54" loading="lazy" decoding="async">
            <div>
              <h3 class="card__title"><a href="${href}">${esc(p.name)}</a></h3>
              <span class="card__category">${esc(p.type)} &middot; ${esc(p.category)}</span>
            </div>
          </div>
          <p class="card__desc">${esc(p.tagline)}</p>
          <div class="card__actions">
            ${storeButton(p)}
            <a class="btn btn--ghost" href="${href}">Details ${ICON.arrow}</a>
          </div>
        </article>`;
}

function breadcrumbs(items) {
  return `        <ul class="breadcrumbs">
${items.map((it, i) => i === items.length - 1
    ? `          <li><span aria-current="page">${esc(it.label)}</span></li>`
    : `          <li><a href="${it.href}">${esc(it.label)}</a></li>`).join('\n')}
        </ul>`;
}

const liveApps = data.products.filter(p => p.section === 'apps');
const liveGames = data.products.filter(p => p.section === 'games');

/* -------------------------------------------------------------------- home */
const featured = ['age-calculator', 'scan2drive', 'number-merge']
  .map(slug => data.products.find(p => p.slug === slug)).filter(Boolean);

const heroShots = ['age-calculator', 'scan2drive', 'number-merge']
  .map(slug => productAssets(slug).shots[0]).filter(Boolean)
  .map((src, i) => `          <img class="hero__shot" src="${src}" alt="Screenshot from a ${BRAND} app" ${i === 1 ? '' : 'loading="lazy" '}decoding="async">`).join('\n');

const homeLd = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': `${DOMAIN}/#organization`,
      name: BRAND,
      url: DOMAIN,
      logo: `${DOMAIN}/assets/products/age-calculator/icon-512.png`,
      slogan: data.brand.tagline,
      sameAs: [data.brand.playDeveloperUrl],
    },
    {
      '@type': 'WebSite',
      '@id': `${DOMAIN}/#website`,
      url: DOMAIN,
      name: BRAND,
      publisher: { '@id': `${DOMAIN}/#organization` },
      inLanguage: 'en',
    },
  ],
};

out('index.html', `${head({
  title: `${BRAND} — Build. Create. Simplify.`,
  description: 'Independent Android app and game studio. Nine apps and games on Google Play, plus Chrome extensions — small tools that keep your data on your device.',
  canonicalPath: '/',
  ogTitle: `${BRAND} — Independent App & Game Studio`,
  jsonld: homeLd,
})}
${header('/')}
    <section class="hero">
      <div class="container hero__inner">
        <div>
          <span class="hero__eyebrow">Independent App &amp; Game Studio</span>
          <h1 class="hero__title">Build. Create.<br>Simplify.</h1>
          <p class="hero__lead">Independent Android apps and games, designed to make everyday life simpler — scanning, dates, conversions, expenses, and small puzzles to pass the time.</p>
          <div class="hero__cta">
            <a class="btn btn--primary btn--lg" href="/apps/">Explore Apps</a>
            <a class="btn btn--secondary btn--lg" href="/games/">Explore Games</a>
          </div>
        </div>
        <div class="hero__visual" role="img" aria-label="Screenshots from ${BRAND} apps">
${heroShots}
        </div>
      </div>
    </section>

    <section class="trust">
      <div class="container trust__inner">
        <span class="trust__item">${ICON.play} 9 apps &amp; games on Google Play</span>
        <span class="trust__item">${ICON.puzzle} Chrome extensions for desktop</span>
        <span class="trust__item">${ICON.shield} Privacy-first by design</span>
      </div>
    </section>

    <section class="section section--surface">
      <div class="container">
        <div class="section__head">
          <div>
            <h2 class="section__title" id="featured-title">Featured</h2>
            <p class="section__lead mb-0">Three worth starting with — one for dates, one for documents, one to unwind with.</p>
          </div>
          <a class="btn btn--secondary" href="/apps/">All apps</a>
        </div>
        <div class="cards">
${featured.map(p => card(p, { withShot: true })).join('\n')}
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section__head">
          <div>
            <h2 class="section__title" id="stance-title">Two catalogues, one studio</h2>
            <p class="section__lead mb-0">Utility apps for the things you do every week, and short-session puzzle games for the gaps in between.</p>
          </div>
        </div>
        <div class="grid grid--2">
          <article class="card">
            <div class="card__head">
              <div>
                <span class="card__category">${liveApps.length} apps</span>
                <h3 class="card__title" style="font-size:1.25rem;margin-top:4px;">Apps</h3>
              </div>
            </div>
            <p class="card__desc">Scanning, documents, dates, unit conversion, receipts and point of sale. All on-device, all without an account.</p>
            <div class="card__actions"><a class="btn btn--primary" href="/apps/">Browse apps ${ICON.arrow}</a></div>
          </article>
          <article class="card">
            <div class="card__head">
              <div>
                <span class="card__category">${liveGames.length} games</span>
                <h3 class="card__title" style="font-size:1.25rem;margin-top:4px;">Games</h3>
              </div>
            </div>
            <p class="card__desc">Sudoku, block puzzle and number merge — calm, unhurried puzzles you can pick up for two minutes or twenty.</p>
            <div class="card__actions"><a class="btn btn--primary" href="/games/">Browse games ${ICON.arrow}</a></div>
          </article>
        </div>
      </div>
    </section>

    <section class="section section--surface">
      <div class="container">
        <h2 class="section__title">How these apps handle your data</h2>
        <p class="section__lead">We would rather state the specifics than make a blanket promise. Each app's own policy is the authoritative description for that app.</p>
        <div class="grid grid--3">
          <div class="card">
            <div class="card__head"><img class="card__icon" src="/assets/favicon.svg" alt="" width="54" height="54" style="padding:12px;background:var(--canvas-2)"><div><h3 class="card__title">On-device by default</h3></div></div>
            <p class="card__desc">The core features of these apps work locally: your scans, dates, conversions and expenses live on your device, not on a server of ours.</p>
          </div>
          <div class="card">
            <div class="card__head"><img class="card__icon" src="/assets/favicon.svg" alt="" width="54" height="54" style="padding:12px;background:var(--canvas-2)"><div><h3 class="card__title">No account needed</h3></div></div>
            <p class="card__desc">None of the current apps require you to register or sign in to use their main features.</p>
          </div>
          <div class="card">
            <div class="card__head"><img class="card__icon" src="/assets/favicon.svg" alt="" width="54" height="54" style="padding:12px;background:var(--canvas-2)"><div><h3 class="card__title">Read the policy, per app</h3></div></div>
            <p class="card__desc">Advertising and data handling differ between apps. Every product page links to the exact policy that applies to it.</p>
          </div>
        </div>
      </div>
    </section>

    <section class="section">
      <div class="container">
        <div class="section__head">
          <div>
            <h2 class="section__title" id="extension-title">Chrome extensions</h2>
            <p class="section__lead mb-0">Desktop tools, separate from the Android catalogue.</p>
          </div>
          <a class="btn btn--secondary" href="/extensions/">All extensions</a>
        </div>
        <div class="grid grid--2">
${data.extensions.map(e => `          <article class="card">
            <div class="card__head">
              <div>
                <h3 class="card__title">${esc(e.name)}</h3>
                <span class="card__category">Chrome Extension</span>
              </div>
            </div>
            <p class="card__desc">${e.slug === 'quickshot' ? 'Screenshot and annotate in the browser, without leaving the page.' : 'Switch your browser user agent when you need to test or preview a site.'}</p>
            <div class="card__actions">
${e.storeUrl ? `              <a class="btn btn--store" href="${e.storeUrl}" rel="noopener">${ICON.play} Chrome Web Store</a>` : '              <span class="badge">Store link pending</span>'}
              <a class="btn btn--ghost" href="${e.pageUrl}">Details ${ICON.arrow}</a>
            </div>
          </article>`).join('\n')}
        </div>
      </div>
    </section>
${footer()}`);

/* ------------------------------------------------------------------- apps */
function collectionPage({ section, title, lead, items, current, intro }) {
  return `${head({
    title: `${title} — ${BRAND}`,
    description: lead,
    canonicalPath: `/${section}/`,
  })}
${header(current)}
    <section class="page-header">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: title }])}
        <h1>${title}</h1>
        <p class="page-header__lead">${lead}</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
${intro || ''}
        <div class="cards">
${items.map(p => card(p, { withShot: true })).join('\n')}
        </div>
      </div>
    </section>
${footer()}`;
}

out('apps/index.html', collectionPage({
  section: 'apps',
  title: 'Apps',
  lead: `Nine Android releases, ${liveApps.length} of them everyday tools. Every app runs its core features on your device and links to its own privacy policy.`,
  items: liveApps,
  current: '/apps/',
  intro: '',
}));

out('games/index.html', collectionPage({
  section: 'games',
  title: 'Games',
  lead: `Three calm puzzle games — Sudoku, Block Puzzle and Number Merge. Short sessions, no pressure, no sign-in.`,
  items: liveGames,
  current: '/games/',
  intro: '',
}));

/* -------------------------------------------------------------- extensions */
out('extensions/index.html', `${head({
  title: `Chrome Extensions — ${BRAND}`,
  description: 'Chrome extensions from LLC AI LABS: QuickShot for screenshots and annotation, and User-Agent Switcher for testing.',
  canonicalPath: '/extensions/',
})}
${header('/extensions/')}
    <section class="page-header">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Extensions' }])}
        <h1>Extensions</h1>
        <p class="page-header__lead">Desktop browser tools. These are separate from the Android apps and games — different platform, different install route.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <div class="grid grid--2">
${data.extensions.map(e => `          <article class="card">
            <div class="card__head">
              <div>
                <h3 class="card__title">${esc(e.name)}</h3>
                <span class="card__category">Chrome Extension</span>
              </div>
            </div>
            <p class="card__desc">${e.slug === 'quickshot' ? 'Capture a region of the page and annotate it before saving or sharing.' : 'Change the user agent your browser sends, for previewing or testing sites.'}</p>
            <div class="card__actions">
${e.storeUrl ? `              <a class="btn btn--store" href="${e.storeUrl}" rel="noopener">${ICON.play} Chrome Web Store</a>` : '              <span class="badge">Store link pending</span>'}
              <a class="btn btn--secondary" href="${e.pageUrl}">Product page ${ICON.arrow}</a>
              <a class="btn btn--ghost" href="${e.privacyUrl}">Privacy</a>
            </div>
          </article>`).join('\n')}
        </div>
      </div>
    </section>
${footer()}`);

/* ------------------------------------------------------------- support hub */
out('support/index.html', `${head({
  title: `Support — ${BRAND}`,
  description: 'Where to get help with an LLC AI LABS app, game or extension, and where to find the privacy policy for each product.',
  canonicalPath: '/support/',
})}
${header('/support/')}
    <section class="page-header">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Support' }])}
        <h1>Support</h1>
        <p class="page-header__lead">Start with the product's own policy and FAQ. If that does not answer it, the contact page explains how to reach us.</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
        <h2 class="section__title">Android apps &amp; games</h2>
        <p class="section__lead">Each product page carries its own FAQ, package name and privacy link.</p>
        <ul class="app-info">
${data.products.map(p => `          <li><strong><a href="/${p.section}/${p.slug}/">${esc(p.name)}</a></strong><span><a href="${p.privacyUrl}">Privacy policy</a>${p.dataDeletionUrl ? ` &middot; <a href="${p.dataDeletionUrl}">Data deletion</a>` : ''}</span></li>`).join('\n')}
        </ul>

        <h2 class="section__title" style="margin-top:48px;">Chrome extensions</h2>
        <ul class="app-info">
${data.extensions.map(e => `          <li><strong><a href="${e.pageUrl}">${esc(e.name)}</a></strong><span><a href="${e.privacyUrl}">Privacy policy</a> &middot; <a href="${e.supportUrl}">Extension support</a></span></li>`).join('\n')}
        </ul>

        <div class="cta-box" style="margin-top:40px;">
          <p><strong>Still stuck?</strong></p>
          <p class="cta-box__lead">Write to <a href="${mailto(CONTACT.supportEmail, 'Support request')}">${CONTACT.supportEmail}</a> with the app name and version, or use the contact page for privacy and business questions.</p>
          <a class="btn btn--primary" href="${mailto(CONTACT.supportEmail, 'Support request')}">Email support ${ICON.arrow}</a>
          <a class="btn btn--secondary" href="/contact/" style="margin-left:10px;">Contact page</a>
        </div>
      </div>
    </section>
${footer()}`);

/* ----------------------------------------------------------- data deletion */
out('data-deletion/index.html', `${head({
  title: `Data deletion — ${BRAND}`,
  description: 'How to request deletion of data held by an LLC AI LABS app, including per-app deletion pages and in-app options.',
  canonicalPath: '/data-deletion/',
})}
${header('/support/')}
    <section class="page-header">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Data deletion' }])}
        <h1>Data deletion</h1>
        <p class="page-header__lead">Most of these apps keep your data on your own device, so uninstalling or clearing app data removes it. Where an app also offers a formal request route, it is listed below.</p>
      </div>
    </section>
    <section class="section">
      <div class="container container--narrow">
        <h2 class="section__title">Products with a dedicated deletion page</h2>
        <ul class="app-info">
${data.products.filter(p => p.dataDeletionUrl).map(p => `          <li><strong>${esc(p.name)}</strong><span><a href="${p.dataDeletionUrl}">Data deletion page</a></span></li>`).join('\n')}
        </ul>
        <div class="notice">
          For the other apps, the privacy policy explains what is stored and how to remove it. For a formal request, write to <a href="${mailto(CONTACT.privacyEmail, 'Data deletion request')}">${CONTACT.privacyEmail}</a> or use the contact page.
        </div>
        <h2 class="section__title" style="margin-top:36px;">Policies</h2>
        <ul class="app-info">
${data.products.map(p => `          <li><strong>${esc(p.name)}</strong><span><a href="${p.privacyUrl}">Privacy policy</a></span></li>`).join('\n')}
        </ul>
      </div>
    </section>
${footer()}`);

/* ----------------------------------------------------------------- contact
   Support and privacy addresses were confirmed by the site owner (2026-11-11).
   Business has no confirmed mailbox yet, so it is routed through the confirmed
   inbox and explicitly labelled as such — never invented. */
out('contact/index.html', `${head({
  title: `Contact — ${BRAND}`,
  description: 'How to reach LLC AI LABS about an app, a privacy request or a partnership, and what to include in your message.',
  canonicalPath: '/contact/',
})}
${header('/contact/')}
    <section class="page-header">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Contact' }])}
        <h1>Contact</h1>
        <p class="page-header__lead">Three routes, depending on what you need. Product questions are usually answered faster by the app's own page than by email.</p>
      </div>
    </section>
    <section class="section">
      <div class="container container--narrow">
        <h2 class="section__title">Start here</h2>
        <ul class="contact-list">
          <li class="contact-item">
            <span class="contact-item__icon" aria-hidden="true">1</span>
            <div class="contact-item__body">
              <strong>A question about an app or game</strong>
              <p>Every product page carries an FAQ and its package name. Most questions about features, storage and permissions are answered there.
                <a href="/support/">Open support</a></p>
            </div>
          </li>
          <li class="contact-item">
            <span class="contact-item__icon" aria-hidden="true">2</span>
            <div class="contact-item__body">
              <strong>Privacy or data deletion</strong>
              <p>The privacy policy for the app you use names the address to write to, and the deletion page explains what to send.
                <a href="/privacy/">Privacy policies</a> &middot; <a href="/data-deletion/">Data deletion</a></p>
            </div>
          </li>
          <li class="contact-item">
            <span class="contact-item__icon" aria-hidden="true">3</span>
            <div class="contact-item__body">
              <strong>Business, press or partnerships</strong>
              <p>Write to the support address with &ldquo;Business&rdquo; in the subject line. A dedicated business mailbox is not confirmed yet, so none is published here. Our verified public identity is the
                <a href="${data.brand.playDeveloperUrl}" rel="noopener">Google Play developer page</a>.</p>
            </div>
          </li>
        </ul>

        <h2 class="section__title" style="margin-top:40px;">Email us</h2>
        <ul class="app-info">
          <li><strong>Support</strong><span><a href="${mailto(CONTACT.supportEmail, 'Support request')}">${CONTACT.supportEmail}</a></span></li>
          <li><strong>Privacy &amp; data deletion</strong><span><a href="${mailto(CONTACT.privacyEmail, 'Privacy request')}">${CONTACT.privacyEmail}</a></span></li>
          <li><strong>Business, press &amp; partnerships</strong><span>Same address, subject starting with &ldquo;Business&rdquo; — no separate mailbox is published.</span></li>
        </ul>

        <div class="notice">
          <strong>One inbox, three subjects.</strong> Support and privacy requests both reach <a href="${mailto(CONTACT.supportEmail, 'Support request')}">${CONTACT.supportEmail}</a>, which is the same address named in the app privacy policies. Put the prefix in the subject line so the message can be routed.
        </div>

        <h2 class="section__title" style="margin-top:40px;">What to include in your message</h2>
        <p class="section__lead">This is what lets us answer without a round trip.</p>
        <ul class="features">
          <li>${ICON.check}<span><strong>App name and version</strong> — Settings &rarr; About inside the app.</span></li>
          <li>${ICON.check}<span><strong>Device model and Android version</strong> — Settings &rarr; About phone.</span></li>
          <li>${ICON.check}<span><strong>A short description and the steps to reproduce</strong> the problem.</span></li>
          <li>${ICON.check}<span><strong>A screenshot or screen recording</strong>, if the issue is visual.</span></li>
        </ul>

        <div class="cta-box">
          <p><strong>Privacy requests</strong></p>
          <p class="cta-box__lead">If your request involves personal data, include enough detail for us to identify the record — the address you originally wrote from is usually sufficient.</p>
          <a class="btn btn--secondary" href="/privacy/">Read the privacy policy ${ICON.arrow}</a>
        </div>
      </div>
    </section>
${footer()}`);

/* ---------------------------------------------------------- product pages */
function productPage(p) {
  const a = productAssets(p.slug);
  const path_ = `/${p.section}/${p.slug}/`;
  const ld = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'SoftwareApplication',
        name: p.name,
        applicationCategory: p.type === 'Game' ? 'GameApplication' : 'UtilitiesApplication',
        operatingSystem: 'Android',
        url: `${DOMAIN}${path_}`,
        image: `${DOMAIN}${a.icon}`,
        description: p.tagline,
        publisher: { '@type': 'Organization', name: BRAND, url: DOMAIN },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${DOMAIN}/` },
          { '@type': 'ListItem', position: 2, name: p.section === 'apps' ? 'Apps' : 'Games', item: `${DOMAIN}/${p.section}/` },
          { '@type': 'ListItem', position: 3, name: p.name, item: `${DOMAIN}${path_}` },
        ],
      },
      {
        '@type': 'FAQPage',
        mainEntity: p.faq.map(f => ({
          '@type': 'Question',
          name: f.q,
          acceptedAnswer: { '@type': 'Answer', text: f.a },
        })),
      },
    ],
  };
  const related = data.products.filter(x => x.slug !== p.slug && x.section === p.section).slice(0, 3);

  return `${head({
    title: `${p.name} — ${p.type} for Android · ${BRAND}`,
    description: `${p.tagline} ${p.intro}`.slice(0, 158),
    canonicalPath: path_,
    ogTitle: p.name,
    ogType: 'product',
    jsonld: ld,
  })}
${header(`/${p.section}/`)}
    <section class="product-hero">
      <div class="container">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: p.section === 'apps' ? 'Apps' : 'Games', href: `/${p.section}/` }, { label: p.name }])}
        <div class="product-hero__inner">
          <img class="product-hero__icon" src="${a.icon}" alt="${esc(p.name)} app icon" width="132" height="132">
          <div class="product-hero__body">
            <h1>${esc(p.name)}</h1>
            <p class="product-hero__tagline">${esc(p.tagline)}</p>
            <div class="product-hero__meta">
              <span class="badge badge--live">Available on Google Play</span>
              <span>${esc(p.type)} &middot; ${esc(p.category)}</span>
              <code>${esc(p.packageId)}</code>
            </div>
          </div>
          <div class="product-hero__cta">
            ${storeButton(p, 'btn--lg')}
            <a class="btn btn--secondary" href="${p.privacyUrl}">Privacy policy</a>
          </div>
        </div>
      </div>
    </section>
${a.shots.length ? `
    <section class="section section--tight section--surface">
      <div class="container">
        <h2 class="section__title" style="font-size:1.125rem;">Screenshots</h2>
        <div class="shots">
${a.shots.map((s, i) => `          <img src="${s}" alt="${esc(p.name)} screenshot ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}" decoding="async">`).join('\n')}
        </div>
      </div>
    </section>
` : ''}
    <section class="section">
      <div class="container">
        <div class="product-body">
          <div>
            <h2 class="section__title">About ${esc(p.name)}</h2>
            <p class="section__lead">${esc(p.intro)}</p>
            <h2 class="section__title" style="margin-top:36px;">What it does</h2>
            <ul class="features">
${p.features.map(f => `              <li>${ICON.check}<span>${esc(f)}</span></li>`).join('\n')}
            </ul>
            <h2 class="section__title" style="margin-top:40px;">Questions</h2>
            <div class="faq">
${p.faq.map(f => `              <details>
                <summary>${esc(f.q)}</summary>
                <p>${esc(f.a)}</p>
              </details>`).join('\n')}
            </div>
          </div>
          <aside>
            <div class="aside-card">
              <h3 class="aside-card__title">App info</h3>
              <ul class="app-info">
                <li><strong>Name on Google Play</strong><span>${esc(p.name)}</span></li>
${p.formerName ? `                <li><strong>Previously listed as</strong><span>${esc(p.formerName)}</span></li>\n` : ''}                <li><strong>Package</strong><span><code>${esc(p.packageId)}</code></span></li>
                <li><strong>Platform</strong><span>Android</span></li>
                <li><strong>Category</strong><span>${esc(p.category)}</span></li>
                <li><strong>Privacy policy</strong><span><a href="${p.privacyUrl}">Read it</a></span></li>
${p.dataDeletionUrl ? `                <li><strong>Data deletion</strong><span><a href="${p.dataDeletionUrl}">Request deletion</a></span></li>\n` : ''}              </ul>
              <div style="margin-top:16px;">${storeButton(p)}</div>
            </div>
            <div class="cta-box" style="margin-top:16px;">
              <p><strong>Something not working?</strong></p>
              <p class="cta-box__lead">See the support page for help options.</p>
              <a class="btn btn--secondary" href="/support/">Support ${ICON.arrow}</a>
            </div>
          </aside>
        </div>
      </div>
    </section>

    <section class="section section--surface">
      <div class="container">
        <div class="section__head">
          <div><h2 class="section__title">More from ${BRAND}</h2></div>
          <a class="btn btn--secondary" href="/${p.section}/">All ${p.section}</a>
        </div>
        <div class="cards">
${related.map(r => card(r)).join('\n')}
        </div>
      </div>
    </section>
${footer()}`;
}

for (const p of data.products) {
  out(`/${p.section}/${p.slug}/index.html`.replace(/^\//, ''), productPage(p));
}

/* -------------------------------------------------- unpublished: water-sort */
const ws = data.unlisted.find(u => u.slug === 'water-sort');
out('apps/water-sort/index.html', `${head({
  title: `Water Sort: Color Journey — not currently available · ${BRAND}`,
  description: 'Water Sort: Color Journey is not currently published on Google Play. The privacy policy for the app remains available.',
  canonicalPath: '/apps/water-sort/',
  noindex: true,
})}
${header('/apps/')}
    <section class="page-header">
      <div class="container container--narrow">
${breadcrumbs([{ label: 'Home', href: '/' }, { label: 'Apps', href: '/apps/' }, { label: 'Water Sort' }])}
        <h1>Water Sort: Color Journey</h1>
        <p class="page-header__lead">This title is not currently available on Google Play, so it is not listed in the catalogue. Its privacy policy stays online for anyone who needs it.</p>
        <div class="badges" style="margin-top:18px;"><span class="badge badge--unpublished">Not currently published</span></div>
      </div>
    </section>
    <section class="section">
      <div class="container container--narrow">
        <p>We would rather leave a page that says so than advertise something you cannot install. If it returns to the store, this page and the catalogue entry will be updated.</p>
        <ul class="app-info">
          <li><strong>Package</strong><span><code>${esc(ws.packageId)}</code></span></li>
          <li><strong>Status</strong><span>Not published on Google Play (checked 11 November 2026)</span></li>
          <li><strong>Privacy policy</strong><span><a href="${ws.privacyUrl}">Read it</a></span></li>
        </ul>
        <div class="cta-box">
          <p><strong>Looking for something to play?</strong></p>
          <p class="cta-box__lead">Sudoku, Block Puzzle and Number Merge are available now.</p>
          <a class="btn btn--primary" href="/games/">Browse games ${ICON.arrow}</a>
        </div>
      </div>
    </section>
${footer()}`);

/* ------------------------------------------------------------------- 404 */
out('404.html', `${head({
  title: `Page not found · ${BRAND}`,
  description: 'That page does not exist. Try the app catalogue, the games catalogue, or the home page.',
  canonicalPath: '/404.html',
  noindex: true,
})}
${header('')}
    <section class="error-page">
      <div class="container">
        <span class="eyebrow">Error 404</span>
        <h1>Page not found</h1>
        <p>The address may have changed, or the link may be out of date. These are usually the better places to start.</p>
        <div class="error-page__actions">
          <a class="btn btn--primary btn--lg" href="/">Home</a>
          <a class="btn btn--secondary btn--lg" href="/apps/">Apps</a>
          <a class="btn btn--secondary btn--lg" href="/games/">Games</a>
        </div>
        <div class="cards">
${featured.map(p => card(p)).join('\n')}
        </div>
      </div>
    </section>
${footer()}`);

/* ------------------------------------------------------- stylesheet copy */
const css = fs.readFileSync(path.join(SRC, 'styles.css'), 'utf8');
out('assets/styles.css', css);

/* ----------------------------------------------------- legacy page heading
   Adds canonical + og:image to pre-existing pages that lack them. Head only;
   body content is never touched. Idempotent: pages that already carry a
   canonical link are left alone (except a known wrong-host canonical). */
/* Descriptions for pre-existing pages. These are head-only edits: the <body>
   of every legal page is left byte-identical to the committed version. */
const DESC_FIX = {
  'agecalculator/privacy-policy.html': 'Privacy policy for My Days (Age Calculator) by LLC AI LABS.',
  'quickqrscanner/privacy-policy.html': 'Privacy policy for Quick QR Scanner by LLC AI LABS.',
  'scan2drive/privacy-policy.html': 'Privacy policy for Scan Tools (Scan2Drive) by LLC AI LABS.',
  'uconverter/privacy-policy.html': 'Privacy policy for uConverter by LLC AI LABS.',
  'mpos/privacy-policy.html': 'Privacy policy for mPOS - Mobile Point of Sale by LLC AI LABS.',
  'sudoku/privacy-policy.html': 'Privacy policy for Sudoku by LLC AI LABS.',
  'BlockPuzzle/privacy-policy.html': 'Privacy policy for Block Puzzle by LLC AI LABS.',
  'numbermerge/privacy-policy.html': 'Privacy policy for Number Merge by LLC AI LABS.',
  'SnapLedger/privacy-policy.html': 'Privacy policy for SnapLedger by LLC AI LABS.',
  'WaterSort/privacy-policy.html': 'Privacy policy for Water Sort: Color Journey by LLC AI LABS.',
  'braintwist/privacy-policy.html': 'Privacy policy for Brain Twist by LLC AI LABS.',
  'crosswordjourney/privacy-policy.html': 'Privacy policy for Crossword Journey by LLC AI LABS.',
  'kuizku/privacy-policy.html': 'Privacy policy for KuizKu by LLC AI LABS.',
  'apps/mathnova/privacy/index.html': 'Privacy policy for MathNova by LLC AI LABS.',
  'quickshot/index.html': 'QuickShot - screenshot and annotate in Chrome, from LLC AI LABS.',
  'quickshot/privacy-policy.html': 'Privacy policy for the QuickShot Chrome extension by LLC AI LABS.',
  'chrome-extensions/user-agent-switcher/index.html': 'User-Agent Switcher - a Chrome extension from LLC AI LABS for previewing sites under different user agents.',
  'privacy/ua-switcher/index.html': 'Privacy policy for the User-Agent Switcher Chrome extension by LLC AI LABS.',
};

function legacyHeadFix() {
  const skip = new Set([
    'index.html', '404.html', 'assets/styles.css',
  ]);
  const generated = new Set([
    'apps/index.html', 'games/index.html', 'extensions/index.html',
    'support/index.html', 'data-deletion/index.html', 'contact/index.html',
    'apps/water-sort/index.html',
    ...data.products.map(p => `${p.section}/${p.slug}/index.html`),
  ]);
  const files = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (e.name !== 'assets') walk(full); }
      else if (e.name.endsWith('.html')) files.push(full);
    }
  })(DOCS);

  let touched = 0;
  for (const abs of files) {
    const rel = path.relative(DOCS, abs).split(path.sep).join('/');
    if (skip.has(rel) || generated.has(rel)) continue;
    let html = fs.readFileSync(abs, 'utf8');
    if (!html.includes('</head>')) continue;
    const original = html;

    // Replace a canonical that points at the old github.io host.
    html = html.replace(
      /<link rel="canonical" href="https:\/\/leonchoo\.github\.io\/llcailabs[^"]*">/g,
      `<link rel="canonical" href="${DOMAIN}/${rel.replace(/index\.html$/, '').replace(/\.html$/, '.html')}">`.replace(`${DOMAIN}//`, `${DOMAIN}/`),
    );
    // Remove Search Console placeholder canonical if any survived above.

    const inject = [];
    // canonical: index.html pages map to their directory URL
    if (!/rel="canonical"/.test(html)) {
      const dirUrl = rel.replace(/index\.html$/, '');
      inject.push(`<link rel="canonical" href="${DOMAIN}/${dirUrl}">`);
    }
    if (!/property="og:image"/.test(html)) {
      inject.push(`<meta property="og:image" content="${OG_IMAGE}">`);
      inject.push(`<meta name="twitter:card" content="summary_large_image">`);
    }
    // legal pages should not be marked as products
    html = html.replace(/<meta property="og:type" content="product">/g, '<meta property="og:type" content="article">');

    const desc = DESC_FIX[rel];
    if (desc) {
      if (/<meta name="description" content="[^"]*">/.test(html)) {
        html = html.replace(/<meta name="description" content="[^"]*">/,
          `<meta name="description" content="${esc(desc)}">`);
      } else {
        inject.push(`<meta name="description" content="${esc(desc)}">`);
      }
    }

    if (inject.length) {
      html = html.replace('</head>', `  ${inject.join('\n  ')}\n</head>`);
    }
    if (html !== original) {
      if (CHECK) { errors.push(`STALE(head): ${rel}`); }
      else { fs.writeFileSync(abs, html); written.push({ path: rel, bytes: Buffer.byteLength(html), sha256: crypto.createHash('sha256').update(html).digest('hex'), note: 'head-only' }); }
      touched++;
    }
  }
  return touched;
}

/* --------------------------------------------------------------- sitemap */
function sitemap() {
  const urls = [
    '/', '/apps/', '/games/', '/extensions/', '/support/', '/data-deletion/', '/contact/',
    '/privacy/', '/terms/', '/calendars/',
    ...data.products.map(p => `/${p.section}/${p.slug}/`),
    '/quickshot/', '/quickshot/about.html', '/quickshot/support.html', '/quickshot/privacy-policy.html',
    '/chrome-extensions/user-agent-switcher/', '/support/ua-switcher/', '/privacy/ua-switcher/',
    '/apps/mathnova/privacy/',
    '/quickqrscanner/privacy-policy.html', '/scan2drive/privacy-policy.html', '/scan2drive/data-deletion.html',
    '/agecalculator/privacy-policy.html', '/uconverter/privacy-policy.html',
    '/SnapLedger/privacy-policy.html', '/SnapLedger/delete-data.html',
    '/sudoku/privacy-policy.html', '/BlockPuzzle/privacy-policy.html', '/numbermerge/privacy-policy.html',
    '/mpos/privacy-policy.html', '/WaterSort/privacy-policy.html',
    '/kuizku/privacy-policy.html', '/braintwist/privacy-policy.html', '/crosswordjourney/privacy-policy.html',
  ];
  const body = urls.map(u => `  <url><loc>${DOMAIN}${u}</loc></url>`).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;
}
out('sitemap.xml', sitemap());

/* ------------------------------------------------------------------ run */
const touched = CHECK ? 0 : legacyHeadFix();

if (!CHECK) {
  const total = written.reduce((s, w) => s + w.bytes, 0);
  console.log(`generated ${written.length} files, ${(total / 1024).toFixed(1)} KB, legacy head fixes: ${touched}`);
  fs.writeFileSync(path.join(ROOT, '.build-manifest.json'), JSON.stringify(written, null, 2), 'utf8');
} else {
  console.log(errors.length ? `CHECK FAILED\n${errors.join('\n')}` : 'CHECK OK: docs matches sources');
  process.exit(errors.length ? 1 : 0);
}
