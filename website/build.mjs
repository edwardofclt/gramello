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
const documentLinks = {
  'privacy.md': '../privacy/', 'support.md': '../support/', 'terms.md': '../terms/',
  '../website/guides/': '../guides/',
  '../website/guides/getting-started.md': '../guides/getting-started/',
};
// Deliberately small renderer for the checked-in policies and user guides.
// Raw HTML is escaped; unsupported Markdown fails so policy text cannot disappear.
function inline(value) {
  return escape(value).replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, label, href) => {
    const target = documentLinks[href] ?? href;
    if (!/^(https:\/\/|mailto:|\.\.\/)/.test(target)) throw new Error(`Unsupported link: ${href}`);
    return `<a href="${target}">${label}</a>`;
  }).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}
function markdown(text) {
  const sections = [];
  const html = [];
  const lines = text.trim().split('\n');
  let paragraph = [], items = [], listType = 'ul';
  const flushParagraph = () => { if (paragraph.length) html.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; };
  const flushList = () => { if (items.length) html.push(`<${listType}>${items.map(item => `<li>${inline(item)}</li>`).join('')}</${listType}>`); items = []; };
  for (const line of lines) {
    if (line.startsWith('# ')) continue;
    if (/^(###|\||```)/.test(line)) throw new Error(`Unsupported Markdown: ${line}`);
    if (line.startsWith('## ')) {
      flushParagraph(); flushList();
      const title = line.slice(3), id = slug(title);
      sections.push({ title, id }); html.push(`<h2 id="${id}">${inline(title)}</h2>`);
    } else if (/^(- |\d+\. )/.test(line)) {
      flushParagraph();
      const nextType = line.startsWith('- ') ? 'ul' : 'ol';
      if (nextType !== listType) flushList();
      listType = nextType;
      items.push(line.replace(/^(- |\d+\. )/, ''));
    } else if (line.startsWith('  ') && items.length) {
      items[items.length - 1] += ` ${line.trim()}`;
    } else if (!line.trim()) { flushParagraph(); flushList(); }
    else { flushList(); paragraph.push(line.trim()); }
  }
  flushParagraph(); flushList();
  return { html: html.join('\n'), sections };
}
function chrome(title, description, content, route, { eyebrow = 'THE DETAILS, IN PLAIN SIGHT', breadcrumb = '' } = {}) {
  const prefix = '../'.repeat(route.split('/').length);
  const guidePage = route === 'guides' || route.startsWith('guides/');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="theme-color" content="#0b2230"><meta name="description" content="${escape(description)}"><meta property="og:title" content="${escape(title)} — Gramello"><meta property="og:description" content="${escape(description)}"><meta property="og:type" content="website"><meta property="og:url" content="${origin}/${route}/"><link rel="canonical" href="${origin}/${route}/"><link rel="icon" href="${prefix}assets/favicon-32.png" type="image/png"><link rel="apple-touch-icon" href="${prefix}assets/apple-touch-icon.png"><link rel="stylesheet" href="${prefix}styles.css"><title>${escape(title)} — Gramello</title></head>
<body><a class="skip-link" href="#main">Skip to content</a><header class="site-header wrap"><a class="brand" href="${prefix}" aria-label="Gramello home"><img src="${prefix}assets/gramello-mark.png" width="42" height="42" alt=""><span>gramello.</span></a><nav class="desktop-nav" aria-label="Main navigation"><a href="${prefix}#features">The little details</a><a href="${prefix}#how-it-works">How it works</a><a href="${prefix}guides/"${guidePage ? ' aria-current="' + (route === 'guides' ? 'page' : 'true') + '"' : ''}>User guides</a><a href="${prefix}support/">Support</a></nav><a class="button button-small" href="https://onelink.to/7cj5kw">Get Gramello <span aria-hidden="true">↗</span></a></header>
<main id="main" class="wrap${guidePage ? ' guides-page' : ''}">${breadcrumb}<div class="document-hero"><p class="eyebrow">${escape(eyebrow)}</p><h1>${escape(title)}</h1><p>${escape(description)}</p></div>${content}</main>
<footer class="site-footer wrap"><div class="footer-top"><div><a class="brand" href="${prefix}"><img src="${prefix}assets/gramello-mark.png" alt="" width="36" height="36"><span>gramello.</span></a><p>A thoughtful little food diary.</p></div><nav aria-label="Footer navigation"><a href="${prefix}guides/">User guides</a><a href="${prefix}support/">Support</a><a href="${prefix}privacy/">Privacy</a><a href="${prefix}terms/">Terms & conditions</a><a href="${prefix}support/#privacy-and-deletion-requests">Your data</a></nav></div><div class="footer-bottom"><span>© 2026 Gramello. All rights reserved.</span><span>For everyday awareness. Not medical advice.</span></div></footer></body></html>`;
}
const guides = [
  { slug: 'getting-started', title: 'Your first day with Gramello', category: 'START HERE', description: 'Set your goals, add your first food, and find your way around the app.' },
  { slug: 'logging-food', title: 'Log food your way', category: 'FOOD DIARY', description: 'Search foods, scan a barcode, choose a portion, or add a custom food.' },
  { slug: 'saved-meals', title: 'Save and reuse your meals', category: 'EVERYDAY ROUTINES', description: 'Build a recipe once, set its portions, and log it again whenever you like.' },
  { slug: 'water-and-goals', title: 'Track water and set goals', category: 'MAKE IT YOURS', description: 'Log water, change your preferred units, and adjust daily calorie and macro goals.' },
  { slug: 'trends', title: 'Understand your trends', category: 'YOUR PROGRESS', description: 'Read your charts and see what logged-day averages and goal comparisons mean.' },
  { slug: 'backups-and-data', title: 'Back up and move your data', category: 'YOUR DATA', description: 'Export a backup, move to another device, and recover a diary after an import.' },
  { slug: 'siri', title: 'Use Gramello with Siri', category: 'ON iOS', description: 'Check your totals, log water and saved meals, or ask for a meal idea.' },
];
const guideCard = guide => `<a class="guide-card" href="${guide.slug}/"><span class="eyebrow">${escape(guide.category)}</span><h2>${escape(guide.title)}</h2><p>${escape(guide.description)}</p><span class="guide-card-link">Read guide <span aria-hidden="true">↗</span></span></a>`;
const guideHub = `<section class="guide-start" aria-labelledby="start-heading"><div><p class="eyebrow">NEW TO GRAMELLO?</p><h2 id="start-heading">Start with your first day.</h2><p>A short walkthrough from setting your goals to logging your first meal. These guides cover the Android and iOS apps; Siri is available on iOS.</p></div><a class="button" href="getting-started/">Get started <span aria-hidden="true">→</span></a></section><section class="guide-grid" aria-label="Browse user guides">${guides.slice(1).map(guideCard).join('')}</section><aside class="guide-help"><div><h2>Still need a hand?</h2><p>Tell us what you were trying to do and where you got stuck.</p></div><a class="text-link" href="../support/">Contact support <span aria-hidden="true">↗</span></a></aside>`;
await mkdir(path.join(output, 'guides'), { recursive: true });
await writeFile(path.join(output, 'guides', 'index.html'), chrome('User guides', 'A little guidance for your everyday. Learn how to use Gramello, one task at a time.', guideHub, 'guides', { eyebrow: 'HELP FOR YOUR EVERYDAY' }));
for (const [index, guide] of guides.entries()) {
  const doc = markdown(await readFile(path.join(source, 'guides', `${guide.slug}.md`), 'utf8'));
  const next = guides[index + 1];
  const content = `<div class="document-layout"><nav class="document-toc" aria-label="On this page"><p>IN THIS GUIDE</p>${doc.sections.map(section => `<a href="#${section.id}">${escape(section.title)}</a>`).join('')}<a class="all-guides" href="../">← All user guides</a></nav><article class="document-body">${doc.html}<nav class="guide-next" aria-label="More help">${next ? `<a href="../${next.slug}/"><span>Next guide</span><strong>${escape(next.title)} →</strong></a>` : '<a href="../"><span>Keep exploring</span><strong>All user guides →</strong></a>'}<a href="../../support/">Need help? Contact support</a></nav></article></div>`;
  const breadcrumb = `<nav class="guide-breadcrumb" aria-label="Breadcrumb"><a href="../">User guides</a><span aria-hidden="true">/</span><span aria-current="page">${escape(guide.title)}</span></nav>`;
  await mkdir(path.join(output, 'guides', guide.slug), { recursive: true });
  await writeFile(path.join(output, 'guides', guide.slug, 'index.html'), chrome(guide.title, guide.description, content, `guides/${guide.slug}`, { eyebrow: guide.category, breadcrumb }));
}
const pages = [
  { route: 'privacy', file: 'privacy.md', title: 'Privacy policy', description: 'What we collect, why we need it, and the choices that belong to you.', callout: 'No Gramello account is required. Your diary and personal tracking data stay on your device; we do not store a copy on our servers.' },
  { route: 'terms', file: 'terms.md', title: 'Terms & conditions', description: 'A shared understanding of how Gramello works, what to expect, and your responsibilities.', callout: 'Gramello is a tool for everyday nutrition awareness. It does not provide medical advice, diagnosis, or treatment.' },
  { route: 'support', file: 'support.md', title: 'A little help, right here.', description: 'For the everyday questions, the unexpected hiccups, and anything about your data.', callout: 'Need a hand? Email [gramello@edwardofclt.com](mailto:gramello@edwardofclt.com). There is no Gramello account to manage. We can help with app questions and privacy requests.' },
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
await writeFile(path.join(output, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${['', ...pages.map(page => page.route), 'guides', ...guides.map(guide => `guides/${guide.slug}`)].map(route => `<url><loc>${origin}/${route ? `${route}/` : ''}</loc></url>`).join('')}</urlset>\n`);
console.log(`Built homepage, policies, support, ${guides.length} user guides, guide hub, and 404 in ${output}`);
