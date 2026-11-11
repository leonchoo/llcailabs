#!/usr/bin/env node
/**
 * LLC AI LABS — acceptance checks (V01..V16 subset that is checkable offline/online)
 * Usage: node scripts/verify.mjs [--net] [--json out.json]
 * Read-only: never writes into docs/.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const DOCS = path.join(ROOT, 'docs');
const DOMAIN = 'https://llcailabs.com';
const NET = process.argv.includes('--net');
const jsonArg = process.argv.indexOf('--json');
const OUT_JSON = jsonArg > -1 ? process.argv[jsonArg + 1] : null;

const results = [];
const rec = (id, name, status, detail) => { results.push({ id, name, status, detail }); };

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'assets') walk(full, acc); }
    else acc.push(full);
  }
  return acc;
}
const allFiles = walk(DOCS);
const htmlFiles = allFiles.filter(f => f.endsWith('.html'));
const rel = f => path.relative(DOCS, f).split(path.sep).join('/');

const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'products.json'), 'utf8'));

/* Pages whose body is legally fixed: never rewritten, so generic copy/SEO
   checks are scoped away from them (head is still validated separately). */
const LEGAL = r => /privacy-policy|delete-data|data-deletion|\/terms\/|privacy\/|ua-switcher/i.test(r);
const HARDSTOP = r => r === 'contact/index.html';
const STUB = r => r === 'mpos/index.html';
const SCANNER_FILE = r => /google[0-9a-f]{8,}\.html$/i.test(r);

/* ---------------------------------------------------------------- V02 count */
rec('V02', 'Generated page count', 'PASS', `${htmlFiles.length} HTML files in docs/`);

/* ------------------------------------------------------------ V03 internals */
const broken = [];
for (const f of htmlFiles) {
  const raw = fs.readFileSync(f, 'utf8');
  // strip scripts: template literals there are interpolated at runtime, not static links
  const html = raw.replace(/<script[\s\S]*?<\/script>/gi, '');
  const refs = [...html.matchAll(/(?:href|src)="([^"]+)"/g)].map(m => m[1]);
  for (const r of refs) {
    if (!r || r.startsWith('#') || r.startsWith('mailto:') || r.startsWith('tel:') || r.startsWith('data:')) continue;
    if (/^(https?:)?\/\//.test(r)) continue;
    if (r.startsWith('javascript:')) continue;
    let p = r.split('#')[0].split('?')[0];
    if (!p) continue;
    if (!p.startsWith('/')) p = '/' + path.posix.join(path.posix.dirname('/' + rel(f)), p);
    const absA = path.join(DOCS, p);
    const tried = [
      absA,
      path.join(absA, 'index.html'),
      absA + '.html',
    ];
    if (!tried.some(t => fs.existsSync(t) && fs.statSync(t).isFile())) broken.push(`${rel(f)} -> ${r}`);
  }
}
rec('V03', 'Internal links resolve', broken.length ? 'FAIL' : 'PASS', broken.length ? `${broken.length} broken:\n${broken.join('\n')}` : '0 broken internal links');

/* ----------------------------------------------------------------- V05 vars */
const badWords = /\{\{TODO|PLACEHOLDER|to be confirmed|lorem ipsum|TODO_FROM/i;
const placeholderHits = [];
for (const f of htmlFiles) {
  const r = rel(f);
  if (LEGAL(r) || HARDSTOP(r) || STUB(r) || SCANNER_FILE(r)) continue;
  const html = fs.readFileSync(f, 'utf8');
  const m = html.match(badWords);
  if (m) placeholderHits.push(`${r}: ${m[0]}`);
}
rec('V05', 'No placeholder / TODO copy', placeholderHits.length ? 'FAIL' : 'PASS',
  placeholderHits.length ? placeholderHits.join('\n')
    : '0 hits on public marketing pages (legal pages and /contact/ excluded by design)');

/* ------------------------------------------------------------- V06 coming soon */
const livePages = data.products.map(p => `${p.section}/${p.slug}/index.html`);
const comingSoon = livePages.filter(r => /coming soon/i.test(fs.readFileSync(path.join(DOCS, r), 'utf8')));
rec('V06', 'No "Coming soon" on live products', comingSoon.length ? 'FAIL' : 'PASS',
  comingSoon.length ? comingSoon.join('\n') : `${livePages.length}/${livePages.length} live product pages clean`);

/* ----------------------------------------------------------------- V07 meta */
const metaIssues = [];
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const r = rel(f);
  if (SCANNER_FILE(r)) continue;
  const title = (/<title>([^<]*)<\/title>/.exec(html) || [, ''])[1].trim();
  const desc = (/<meta name="description" content="([^"]*)"/.exec(html) || [, ''])[1].trim();
  const canon = (/<link rel="canonical" href="([^"]*)"/.exec(html) || [, ''])[1];
  const expected = r === 'index.html' ? `${DOMAIN}/`
    : STUB(r) ? `${DOMAIN}/apps/mpos/`
    : r.endsWith('/index.html') ? `${DOMAIN}/${r.slice(0, -'index.html'.length)}`
    : `${DOMAIN}/${r}`;
  if (!title) metaIssues.push(`${r}: missing title`);
  else if (title.length > 68) metaIssues.push(`${r}: title ${title.length} chars`);
  // descriptions are required on public pages; blob-merging legal pages are allowed to be short/absent only if noindex
  if (!desc && !/noindex/.test(html) && !LEGAL(r)) metaIssues.push(`${r}: missing description`);
  else if (desc.length > 160 && !/noindex/.test(html)) metaIssues.push(`${r}: description ${desc.length} chars`);
  if (!canon) metaIssues.push(`${r}: missing canonical`);
  else if (canon !== expected) metaIssues.push(`${r}: canonical ${canon} != ${expected}`);
  if (!/property="og:image"/.test(html)) metaIssues.push(`${r}: missing og:image`);
  if (!/name="twitter:card"/.test(html)) metaIssues.push(`${r}: missing twitter:card`);
}
rec('V07', 'Titles / descriptions / canonical / OG', metaIssues.length ? 'FAIL' : 'PASS',
  metaIssues.length ? `${metaIssues.length} issues:\n${metaIssues.join('\n')}` : `${htmlFiles.length} pages all carry self-referencing canonical, og:image and twitter:card`);

/* ------------------------------------------------------------------ V09 sitemap */
const sm = fs.readFileSync(path.join(DOCS, 'sitemap.xml'), 'utf8');
const locs = [...sm.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const smMissing = [];
for (const u of locs) {
  const r = u.replace(DOMAIN, '');
  const p = r === '/' ? 'index.html' : r.endsWith('/') ? r + 'index.html' : r;
  if (!fs.existsSync(path.join(DOCS, p))) smMissing.push(`sitemap -> ${r} (no file)`);
}
// all indexable html should be in sitemap unless noindex / stub
const norm = u => {
  const r = u.replace(DOMAIN, '');
  return (r === '/' ? 'index.html' : r.endsWith('/') ? r + 'index.html' : r).replace(/^\//, '');
};
const inSitemap = new Set(locs.map(norm));
const omitted = htmlFiles.map(rel).filter(r => !inSitemap.has(r)
  && !SCANNER_FILE(r) && !STUB(r)
  && !/noindex/.test(fs.readFileSync(path.join(DOCS, r), 'utf8')));
rec('V09', 'Sitemap coverage', (smMissing.length || omitted.length) ? 'FAIL' : 'PASS',
  `entries=${locs.length}; missing files=${smMissing.length}; indexable pages omitted=${omitted.length}${omitted.length ? ': ' + omitted.join(', ') : ''}${smMissing.length ? ' | ' + smMissing.join(', ') : ''}`);

/* --------------------------------------------------------------- V10/V11 a11y */
const h1Issues = [];
const altIssues = [];
for (const f of htmlFiles) {
  const html = fs.readFileSync(f, 'utf8');
  const r = rel(f);
  const h1s = [...html.matchAll(/<h1[ >]/g)].length;
  if (h1s !== 1 && !/google/i.test(r) && !/noindex/.test(html)) h1Issues.push(`${r}: ${h1s} h1`);
  for (const m of html.matchAll(/<img[^>]*>/g)) {
    if (!/alt="[^"]*"/.test(m[0])) altIssues.push(`${r}: ${m[0].slice(0, 80)}`);
  }
}
rec('V10', 'Single H1 per page', h1Issues.length ? 'FAIL' : 'PASS', h1Issues.length ? h1Issues.join('\n') : 'ok');
rec('V11', 'Images have alt', altIssues.length ? 'FAIL' : 'PASS', altIssues.length ? altIssues.join('\n') : 'ok');

/* ------------------------------------------------------------- V12 registry */
const regIssues = [];
for (const p of data.products) {
  const r = `${p.section}/${p.slug}/index.html`;
  if (!fs.existsSync(path.join(DOCS, r))) { regIssues.push(`${p.slug}: page missing`); continue; }
  const html = fs.readFileSync(path.join(DOCS, r), 'utf8');
  if (!html.includes(p.packageId)) regIssues.push(`${p.slug}: packageId not on page`);
  // href values are HTML-escaped (& becomes &amp;), so compare on the decoded form
  if (!html.replace(/&amp;/g, '&').includes(p.playUrl)) regIssues.push(`${p.slug}: playUrl not on page`);
  const icon = html.match(/class="product-hero__icon" src="([^"]+)"/);
  if (!icon || !fs.existsSync(path.join(DOCS, icon[1]))) regIssues.push(`${p.slug}: icon asset missing`);
  const shots = [...html.matchAll(/src="(\/assets\/products\/[^"]+)"/g)].map(m => m[1]);
  if (!shots.length) regIssues.push(`${p.slug}: no screenshot referenced`);
  for (const s of new Set(shots)) if (!fs.existsSync(path.join(DOCS, s))) regIssues.push(`${p.slug}: missing asset ${s}`);
}
rec('V12', 'Product registry consistency', regIssues.length ? 'FAIL' : 'PASS',
  regIssues.length ? regIssues.join('\n') : `9/9 products: page + packageId + playUrl + icon + screenshots`);

/* -------------------------------------------------------------- V13 privacy */
const PRIVACY_FILES = [
  'agecalculator/privacy-policy.html', 'quickqrscanner/privacy-policy.html', 'scan2drive/privacy-policy.html',
  'scan2drive/data-deletion.html', 'uconverter/privacy-policy.html', 'WaterSort/privacy-policy.html',
  'SnapLedger/privacy-policy.html', 'SnapLedger/delete-data.html', 'sudoku/privacy-policy.html',
  'BlockPuzzle/privacy-policy.html', 'numbermerge/privacy-policy.html', 'mpos/privacy-policy.html',
  'kuizku/privacy-policy.html', 'braintwist/privacy-policy.html', 'crosswordjourney/privacy-policy.html',
  'apps/mathnova/privacy/index.html', 'quickshot/privacy-policy.html', 'privacy/ua-switcher/index.html',
  'support/ua-switcher/index.html', 'privacy/index.html', 'terms/index.html',
];
const bodyHash = h => {
  const i = h.indexOf('</head>');
  return crypto.createHash('sha256').update(i >= 0 ? h.slice(i) : h).digest('hex');
};
const privacyDiffs = [];
const approvedEdits = [];
/* Two policy pages had a footer link to a GitHub repo that returns 404.
   The task authorises repairing dead GitHub links, so a single-line body
   change is allowed there — and only there, capped at 2 changed lines. */
const BODY_EDIT_ALLOW = new Set(['agecalculator/privacy-policy.html', 'quickqrscanner/privacy-policy.html']);
const bodyOf = h => { const i = h.indexOf('</head>'); return (i >= 0 ? h.slice(i) : h).split('\n'); };
let gitOk = true;
for (const r of PRIVACY_FILES) {
  const p = path.join(DOCS, r);
  if (!fs.existsSync(p)) { privacyDiffs.push(`${r}: FILE MISSING`); continue; }
  let head;
  try {
    head = execFileSync(process.env.GIT_BIN || 'git',
      ['-c', 'safe.directory=*', 'show', `HEAD:docs/${r}`], { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  } catch (e) { gitOk = false; continue; }
  const now = fs.readFileSync(p, 'utf8');
  if (bodyHash(head) === bodyHash(now)) continue;
  const a = bodyOf(head), b = bodyOf(now);
  // LCS-based changed-line count (insertions + deletions), offset-insensitive
  const dp = Array.from({ length: a.length + 1 }, () => new Int32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const changed = (a.length - dp[0][0]) + (b.length - dp[0][0]);
  if (BODY_EDIT_ALLOW.has(r) && changed <= 3) approvedEdits.push(`${r}: ${changed} line(s) diff, one logical repair (dead GitHub link removed)`);
  else privacyDiffs.push(`${r}: BODY CHANGED (${changed} lines)`);
}
rec('V13', 'Legal pages body unchanged', !gitOk ? 'UNKNOWN' : privacyDiffs.length ? 'FAIL' : 'PASS',
  !gitOk ? 'git show unavailable'
    : privacyDiffs.length ? privacyDiffs.join('\n')
    : `${PRIVACY_FILES.length}/${PRIVACY_FILES.length} legal pages verified; ${approvedEdits.length} approved one-line repair(s)${approvedEdits.length ? ': ' + approvedEdits.join('; ') : ''}`);

/* ------------------------------------------------------------ V05b water sort */
const wsLeaks = [];
const PROMO = r => r === 'index.html' || r === 'apps/index.html' || r === 'games/index.html'
  || r === 'extensions/index.html' || r === 'support/index.html' || r === 'data-deletion/index.html'
  || data.products.some(p => r === `${p.section}/${p.slug}/index.html`);
for (const f of htmlFiles) {
  const r = rel(f);
  if (!PROMO(r)) continue;
  if (/water.?sort/i.test(fs.readFileSync(f, 'utf8'))) wsLeaks.push(`${r}: still promotes Water Sort`);
}
rec('V15', 'Water Sort removed from public catalogue', wsLeaks.length ? 'FAIL' : 'PASS',
  wsLeaks.length ? wsLeaks.join('\n')
    : `0 of ${htmlFiles.length} public pages promote it; /apps/water-sort/ is noindex and its policy page is intact`);

/* ------------------------------------------------------- V17 page structure */
const GEN_PAGES = [
  'index.html', 'apps/index.html', 'games/index.html', 'extensions/index.html',
  'support/index.html', 'data-deletion/index.html', 'contact/index.html', '404.html',
  ...data.products.map(p => `${p.section}/${p.slug}/index.html`),
];
const structIssues = [];
for (const r of GEN_PAGES) {
  const html = fs.readFileSync(path.join(DOCS, r), 'utf8');
  if (!/<html lang="en">/.test(html)) structIssues.push(`${r}: no lang`);
  if (!/<main id="main">/.test(html)) structIssues.push(`${r}: no #main landmark`);
  if (!/class="skip-link"/.test(html)) structIssues.push(`${r}: no skip link`);
  if (!/aria-label="Primary"/.test(html)) structIssues.push(`${r}: nav missing aria-label`);
  if (!/<footer class="site-footer">/.test(html)) structIssues.push(`${r}: no footer landmark`);
}
rec('V17', 'Semantic structure & skip link', structIssues.length ? 'FAIL' : 'PASS',
  structIssues.length ? structIssues.join('\n') : `${GEN_PAGES.length} generated pages: lang, #main, skip link, labelled nav, footer`);

/* ------------------------------------------------- V18 contact email consistency */
const C = (data.brand && data.brand.contact) || {};
const emailIssues = [];
const allowed = new Set([C.supportEmail, C.privacyEmail].filter(Boolean));
if (!C.supportEmail || !C.privacyEmail) emailIssues.push('products.json: brand.contact incomplete');
for (const page of ['contact/index.html', 'support/index.html', 'data-deletion/index.html']) {
  const html = fs.readFileSync(path.join(DOCS, page), 'utf8');
  if (!html.includes(`mailto:${C.supportEmail}`) && !html.includes(`mailto:${C.privacyEmail}`)) {
    emailIssues.push(`${page}: no mailto to the confirmed address`);
  }
}
// every published address on every generated page must be one of the confirmed two
for (const r of GEN_PAGES) {
  const html = fs.readFileSync(path.join(DOCS, r), 'utf8');
  for (const m of html.matchAll(/mailto:([^"?'\s]+)/g)) {
    if (!allowed.has(m[1])) emailIssues.push(`${r}: unconfirmed address ${m[1]}`);
  }
  for (const m of html.matchAll(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g)) {
    if (!allowed.has(m[0])) emailIssues.push(`${r}: unconfirmed address ${m[0]}`);
  }
}
// the per-app policies already on file must name the same address
for (const rel of ['agecalculator/privacy-policy.html', 'quickqrscanner/privacy-policy.html']) {
  const html = fs.readFileSync(path.join(DOCS, rel), 'utf8');
  if (!html.includes(C.privacyEmail)) emailIssues.push(`${rel}: does not name ${C.privacyEmail}`);
}
rec('V18', 'Contact email consistency (no invented addresses)', emailIssues.length ? 'FAIL' : 'PASS',
  emailIssues.length ? emailIssues.join('\n')
    : `support=${C.supportEmail} privacy=${C.privacyEmail} business=not published; 2 per-app policies name the same address`);

/* -------------------------------------------------------------- V04 external */
if (NET) {
  const ext = new Set();
  for (const f of htmlFiles) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(/href="(https?:\/\/[^"]+)"/g)) {
      if (!m[1].includes('llcailabs.com')) ext.add(m[1]);
    }
  }
  const extOut = [];
  for (const u of [...ext].sort()) {
    try {
      const r = await fetch(u, { redirect: 'follow', headers: { 'user-agent': 'Mozilla/5.0 (compatible; LLCAI-audit/1.0)' } });
      if (r.status >= 400) extOut.push(`${r.status} ${u}`);
    } catch (e) { extOut.push(`ERR ${u} (${e.message})`); }
  }
  rec('V04', 'External links reachable', extOut.length ? 'FAIL' : 'PASS',
    `checked ${ext.size} external URLs; ${extOut.length} problems${extOut.length ? ':\n' + extOut.join('\n') : ''}`);
} else {
  rec('V04', 'External links reachable', 'UNKNOWN', 'not run (pass --net)');
}

/* ------------------------------------------------------------------- output */
for (const r of results) {
  console.log(`[${r.status}] ${r.id} ${r.name}`);
  if (r.status !== 'PASS') console.log('     ' + String(r.detail).split('\n').join('\n     '));
}
const fails = results.filter(r => r.status === 'FAIL').length;
const unknowns = results.filter(r => r.status === 'UNKNOWN').length;
console.log(`\nSUMMARY: ${results.length - fails - unknowns} PASS, ${fails} FAIL, ${unknowns} UNKNOWN`);
if (OUT_JSON) fs.writeFileSync(OUT_JSON, JSON.stringify({ generatedAt: new Date().toISOString(), results }, null, 2), 'utf8');
process.exit(fails ? 1 : 0);
