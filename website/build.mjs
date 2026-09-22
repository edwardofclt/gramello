import { mkdir, readFile, writeFile, cp, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const source = path.dirname(fileURLToPath(import.meta.url));
const root = path.dirname(source);
const output = path.join(root, 'out', 'website');
const siteUrl = new URL(process.env.SITE_URL || 'https://gramello.com');
if (siteUrl.protocol !== 'https:' || siteUrl.username || siteUrl.password || siteUrl.search || siteUrl.hash) {
  throw new Error('SITE_URL must be a public HTTPS URL without credentials, query, or fragment');
}
const origin = siteUrl.href.replace(/\/$/, '');
const basePath = siteUrl.pathname.replace(/\/$/, '');
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
for (const file of ['index.html', 'styles.css', 'site.js', 'assets']) {
  await cp(path.join(source, file), path.join(output, file), { recursive: true });
}
await writeFile(path.join(output, 'index.html'), (await readFile(path.join(source, 'index.html'), 'utf8')).replaceAll('https://gramello.com', origin));
const escape = value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const legalLinks = { 'privacy.md': '../privacy/', 'support.md': '../support/', 'terms.md': '../terms/' };
// Deliberately small renderer for the checked-in policy/support documents.
// Raw HTML is escaped; unsupported Markdown fails so policy text cannot disappear.
function inline(value) {
  return escape(value).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const target = legalLinks[href] ?? href;
    if (!/^(https:\/\/|mailto:|\.\.\/)/.test(target)) throw new Error(`Unsupported link: ${href}`);
    return `<a href="${target}">${label}</a>`;
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function markdown(text) {
  const sections = [];
  const html = [];
  const lines = text.trim().split('\n');
  let paragraph = [], items = [];
  const flushParagraph = () => { if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; };
  const flushList = () => { if (items.length) html.push(`<ul>${items.map(item => `<li>${inline(item)}</li>`).join('')}</ul>`); items = []; };
  for (const line of lines) {
    if (line.startsWith('# ')) continue;
    if (/^(###|\||```|\d+\. )/.test(line)) throw new Error(`Unsupported Markdown: ${line}`);
    if (line.startsWith('## ')) {
      flushParagraph(); flushList();
      const title = line.slice(3), id = slug(title);
      sections.push({ title, id }); html.push(`<h2 id="${id}">${inline(title)}</h2>`);
    } else if (line.startsWith('- ')) {
      flushParagraph(); items.push(line.slice(2));
    } else if (line.startsWith('  ') && items.length) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line.trim()); }
  }
  flushParagraph(); flushList();
  return { html: html.join('\n'), sections };
}
function chrome(title, description, content, route) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b2230"><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)} — Gramello"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><link rel="canonical" href="${origin}/${route}/"><link rel="icon" href="../assets/favicon-32.png" type="image/png"><link rel="apple-touch-icon" href="../assets/apple-touch-icon.png"><link rel="stylesheet" href="../styles.css"><title>${escape(title)} — Gramello</title></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header wrap"><a class="brand" href="../" aria-label="Gramello home"><img src="../assets/gramello-mark.png" width="42" height="42" alt=""><span>gramello.</span></a><nav class="desktop-nav" aria-label="Main navigation"><a href="../#features">The little details</a><a href="../#how-it-works">How it works</a><a href="../support/">Support</a></nav><a class="button button-small" href="https://nourish-api.fly.dev">Open Gramello <span aria-hidden="true">↗</span></a></header>
<main id="main" class="wrap"><div class="document-hero"><p class="eyebrow">THE DETAILS, IN PLAIN SIGHT</p><h1>${escape(title)}</h1><p>${escape(description)}</p></div>${content}</main>
<footer class="site-footer wrap"><div class="footer-top"><div><a class="brand" href="../"><img src="../assets/gramello-mark.png" alt="" width="36" height="36"><span>gramello.</span></a><p>A thoughtful little food diary.</p></div><nav aria-label="Footer navigation"><a href="../support/">Support</a><a href="../privacy/">Privacy</a><a href="../terms/">Terms & conditions</a><a href="../support/#privacy-and-deletion-requests">Your data</a></nav></div><div class="footer-bottom"><span>© 2026 Edward Herbert II. All rights reserved.</span><span>For everyday awareness. Not medical advice.</span></div></footer></body></html>`;
}
const pages = [
  { route: 'privacy', file: 'privacy.md', title: 'Privacy policy', description: 'What we collect, why we need it, and the choices that belong to you.', callout: 'Your diary and saved recipes are private to your account. Custom foods you contribute to the shared catalog are visible to other users.' },
  { route: 'terms', file: 'terms.md', title: 'Terms & conditions', description: 'A shared understanding of how Gramello works, what to expect, and your responsibilities.', callout: 'Gramello is a tool for everyday nutrition awareness. It does not provide medical advice, diagnosis, or treatment.' },
  { route: 'support', file: 'support.md', title: 'A little help, right here.', description: 'For the everyday questions, the unexpected hiccups, and anything about your account.', callout: 'Need a hand? Email [gramello@edwardofclt.com](mailto:gramello@edwardofclt.com). For account deletion or a copy of your data, use the email associated with your account.' },
];
for (const page of pages) {
  const doc = markdown(await readFile(path.join(root, 'docs', page.file), 'utf8'));
  const content = `<div class="document-layout"><nav class="document-toc" aria-label="On this page"><p>ON THIS PAGE</p>${doc.sections.map(section => `<a href="#${section.id}">${escape(section.title)}</a>`).join('')}</nav><article class="document-body"><div class="document-callout"><p>${inline(page.callout)}</p></div>${doc.html}</article></div>`;
  await mkdir(path.join(output, page.route), { recursive: true });
  await writeFile(path.join(output, page.route, 'index.html'), chrome(page.title, page.description, content, page.route));
}
// Absolute project paths keep assets and navigation working even on an unknown nested URL.
const notFound = chrome('A little off the menu.', 'That page could not be found. Let’s get you back to your day.', '<section class="not-found"><a class="button" href="../">Back to Gramello <span aria-hidden="true">↗</span></a></section>', '404').replaceAll('href="../', `href="${basePath}/`).replaceAll('src="../', `src="${basePath}/`).replace(/<link rel="canonical"[^>]+>/, '<meta name="robots" content="noindex">');
await writeFile(path.join(output, '404.html'), notFound);
await writeFile(path.join(output, '.nojekyll'), '');
await writeFile(path.join(output, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...pages.map(page => page.route)].map(route => `<url><loc>${origin}/${route ? `${route}/` : ''}</loc></url>`).join('')}</urlset>\n`);
console.log(`Built homepage, privacy, terms, support, and 404 pages in ${output}`);
