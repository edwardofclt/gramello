# Gramello public website

A static marketing website with user guides, privacy, terms, support, and an accessible 404
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

The `Gramello website` workflow validates pull requests and publishes website
changes only with stable releases:

- Each stable release created by the `Release` workflow calls the website
  workflow directly, checking the published release tag for website changes. This is
  necessary because releases created with `GITHUB_TOKEN` do not trigger another
  workflow through the `release` event.
- A manually published stable GitHub release runs the same change check. Drafts
  and prereleases do not publish the production website.
- The workflow compares the release with the highest stable version tag in its
  parent history, ignoring prerelease and catalog tags. Changes under `website/`
  (including user guides), the three policy documents, or either publishing
  workflow trigger a build and deployment. Unchanged releases skip the build,
  artifact upload, and deployment. The first stable release publishes the site.
- Website changes merged into `main` wait for the next stable release; pushes
  do not deploy the website separately. Use a releasable commit such as `fix:`
  when a website update needs a new release immediately.
- A manual workflow dispatch on `main` requires a published stable `release_tag`
  and runs the same change check. Rerun a failed publication for that tag to retry.

GitHub Pages must use **GitHub Actions** as its publishing source. The
`github-pages` environment must allow the `main` branch and `v*` tags. Release
tags are checked against the published release and must use `vMAJOR.MINOR.PATCH`.
Production publication runs share a concurrency group. Only a successful build
and site check can proceed to deployment; app-store build failures do not block
the independent website publication job.

## Content

- Homepage and responsive design: `website/index.html` and `website/styles.css`.
- User guide hub: `/guides/`. Individual walkthroughs live in
  `website/guides/*.md`; their titles, descriptions, order, and routes are defined
  by `guides` in `website/build.mjs`. Only those listed guides are published.
  Check instructions and button names against `mobile/src` when updating them.
  Each guide gets a table of contents, breadcrumb, next-guide link, and sitemap
  entry. Use `../guide-slug/` for links between guides and `../../support/` for
  support. Keep these focused on using the mobile apps, not developer setup.
- Privacy/support/terms: `docs/privacy.md`, `docs/support.md`, `docs/terms.md`.
  The build renders these documents, so the site and repository share one source.
- `website/build.mjs` intentionally supports headings, paragraphs, unordered
  and numbered lists, bold text, and links. It escapes raw HTML and fails on unsupported
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
- The owner has directed the site and policies to describe the account-free
  mobile product: personal tracking data stays on the device, with no Gramello
  account or server-side diary storage. Account-based syncing, shared user-food
  submissions, and support-based account deletion are not advertised. This
  content change does not implement the app's storage transition.

## Design and assets

The site combines Gramello's existing navy/mint bowl mark and app palette with
editorial serif headings and food photography. The diary and charts are clearly
marked illustrations with sample data; they do not contain customer records.
All fonts are local system fonts, and images are served with the site. Anonymous
Segment analytics is configured for native app builds; this website does not
include that integration. The privacy policy describes the native app's
generated installation ID and fixed usage events, excludes health and diary
contents from analytics, and identifies the current absence of an in-app
analytics switch. Advertising is not currently implemented. Keep provider,
retention, and user-choice disclosures aligned with actual settings and builds.
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
