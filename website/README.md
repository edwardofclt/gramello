# Gramello public website

A static marketing website with privacy, terms, support, and an accessible 404
page. Published at https://gramello.com/ using GitHub Pages.
The public site presents Android and iOS as separate one-time purchases, with
all app features included and no subscriptions or additional feature paywalls.

## Preview and build

Requires Node.js 24; no package installation is needed.

```sh
node website/build.mjs
node website/check.mjs
python3 -m http.server 4173 --directory out/website
```

Open http://localhost:4173. Generated output is ignored by Git. Only `out/website`
is uploaded; app source, development docs, and server files are not published.
The default public origin is `https://gramello.com`. Set `SITE_URL` when building
for a different HTTPS origin or a GitHub Pages project prefix; canonical URLs,
sitemaps, and 404 navigation follow that value.

The `Gramello website` workflow validates pull requests. After a matching change
merges into `main`, it builds and deploys the same static output. GitHub Pages
must use **GitHub Actions** as its publishing source. A manual workflow dispatch
on `main` also republishes the site.

## Content

- Homepage and responsive design: `website/index.html` and `website/styles.css`.
- Privacy/support/terms: `docs/privacy.md`, `docs/support.md`, `docs/terms.md`.
  The build renders these documents, so the site and repository share one source.
- `website/build.mjs` intentionally supports headings, paragraphs, unordered
  lists, bold text, and links. It escapes raw HTML and fails on unsupported
  block syntax rather than silently losing legal content.
- Update the effective dates when policies materially change. Keep disclosures
  aligned with actual code, services, and operating practices. The terms are
  an initial draft for legal review, not a certification of legal compliance.
- Operator/contact come from the existing launch documents: Edward Herbert II,
  gramello@edwardofclt.com. No location or jurisdiction has been invented.
- The owner is retiring the web version. App-opening and download calls to
  action use https://onelink.to/7cj5kw, the owner's shared link for routing
  visitors to Google Play or the Apple App Store. No web-app or free-APK
  download links are advertised.
- Keep release availability wording aligned with confirmed store availability.
  OneLink configuration is managed separately from this site. Do not imply
  one platform purchase also includes the other.

## Design and assets

The site combines Gramello's existing navy/mint bowl mark and app palette with
editorial serif headings and food photography. The diary and charts are clearly
marked illustrations with sample data; they do not contain customer records.
All fonts are local system fonts, and images are served with the site. Anonymous
Segment analytics is configured for native app builds; this website does not
include that integration. Advertising may be introduced in the future and is
not currently implemented. The privacy policy must describe the actual
providers, data practices, and applicable user choices before activation.
Avoid marketing promises of a permanently ad-free or tracker-free product.
The FAQ works with native HTML without JavaScript;
JavaScript only keeps one answer open at a time. Reduced motion is respected.

`assets/gramello-mark.png`, `assets/favicon-32.png`, and
`assets/apple-touch-icon.png` reuse the existing app branding.
`assets/lunch-bowl.webp` was generated with the built-in image-generation tool
and optimized to WebP. The source prompt was:

> Use case: photorealistic-natural. Asset type: website food photography for
> Gramello, a friendly calorie and macro diary with a deep ink navy and fresh mint
> brand. Create one premium editorial food photograph, landscape 3:2 composition.
> A simple beautiful pale seafoam ceramic bowl of vibrant everyday lunch: sliced
> grilled chicken, quinoa, avocado, cucumber, cherry tomatoes, spinach and a
> little lemon dressing, on a lightly textured warm ivory tabletop. Bowl in
> right-center with full rim visible and space around it. A fork and softly
> folded natural linen napkin at left, a halved lemon near top right. Natural
> afternoon window light, sophisticated magazine photography, inviting and
> realistic, subtle grain, precise food texture. No people, no text, no lettering,
> no logo, no graphics, no watermarks. This is a standalone photograph asset,
> not a webpage screenshot.

## Disclosure references

Implementation is the primary source for product and data-practice claims.
The existing privacy/support documents were preserved and extended to cover the
new static website. Reference checks on September 22, 2026:

- [GitHub Pages publishing](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)
- [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)
- [Apple privacy guidelines](https://developer.apple.com/app-store/review/guidelines/#privacy)
- [FTC guidance on changes to privacy commitments](https://www.ftc.gov/policy/advocacy-research/tech-at-ftc/2024/02/ai-other-companies-quietly-changing-your-terms-service-could-be-unfair-or-deceptive)
- [FTC mobile health app guidance](https://www.ftc.gov/business-guidance/resources/mobile-health-apps-interactive-tool)

Publishing the website does not complete App Store submission requirements;
see `docs/app-store-preparation.md` for native app release work.
