# Gramello App Store preparation

Status checked September 22, 2026. App Store Connect app ID: `6814035327`.
The app remains **Prepare for Submission**; it has not been submitted or released.

## Saved launch settings

| Setting | Value |
| --- | --- |
| App name | Gramello: Calories & Macros |
| Subtitle | Food diary & nutrition trends |
| Primary category | Health & Fitness |
| Secondary category | Food & Drink |
| Primary localization | English (U.S.) |
| Prepared listing version | 1.8.0 |
| Attached build | 1.8.0 (12), Ready to Submit in TestFlight |
| Price | US$1.99; base country United States |
| Availability | United States only; all other countries/regions unavailable |
| New regions | Automatic availability disabled |
| Age rating | 13+ in the current system; 12+ on operating systems before version 26 |
| Medical-device declaration | Declared not a regulated medical device |
| Support/privacy contact | gramello@edwardofclt.com |

Description, promotional text, keywords, copyright, support URL, and App Review
notes/contact email were entered in the version listing. The listing copy and
review notes include water tracking. The privacy-policy URL was entered in App
Privacy. Public GitHub commit permalinks to `support.md` and `privacy.md` allow
these links to work before this documentation PR is merged.
The repository is now [edwardofclt/gramello](https://github.com/edwardofclt/gramello).

The saved age questionnaire includes health/wellness topics, infrequent alcohol
references in food results, and shared custom foods from the earlier build.
The current native build keeps custom foods private on the device; recheck the
questionnaire against the final build. Regional age-rating tables do not enable
distribution outside the United States.

## Mobile purchase model

Confirmed by the owner on September 22, 2026: the web version is being retired.
Android and iOS will each be a separate one-time purchase, with all app features
included and no subscriptions or additional feature paywalls. The website marks
paid mobile releases as coming soon until official purchase listings are ready.
This describes the product plan; it does not change store billing configuration
or remove the existing web service or Android release artifacts.

## Privacy label and current native behavior

The published App Privacy label is a snapshot of an earlier hosted-data build
and must be reviewed against the final native release. Updating repository
files does not change App Store Connect disclosures.

The current iOS/Android app opens directly without an account. Diary entries,
water, goals, recipes, and custom foods live in local SQLite. Native builds do
not upload a personal diary to the hosted web service. Export/import uses files
chosen through the operating system's share/save interface; exported files are
readable by anyone who can access them.

Camera frames are processed on-device for barcodes; an online food lookup
receives the barcode, not camera images. Catalog downloads and online lookups
use external services. Segment usage analytics, when a public write key is
configured, uses a persistent random installation ID and fixed event names.
The allowlist excludes diary contents, search terms, barcodes, nutrition values,
and personal identity. See [the mobile analytics guide](../mobile/README.md#anonymous-usage-analytics)
for the exact event and payload fields. There is no advertising integration.

## Remaining release work

- Review App Privacy for the final native build and Segment destination settings.
  Reconcile the earlier hosted-data disclosures with local storage and the
  configured anonymous analytics. Publish matching privacy-policy text before
  release; the existing policy still describes analytics as planned.
- Accept Apple's Paid Apps Agreement in **Business**, then complete any banking
  and tax setup Apple requires. The agreement currently shows **New**.
- Confirm third-party content rights and complete the Content Rights declaration.
  Review attribution/license requirements for Open Food Facts data and images,
  USDA data, and the newly merged restaurant sources.
- Expose the privacy policy and support contact inside the app. Verify that the
  local-storage, export/import, and data-removal guidance matches the release.
- Update App Review notes to explain that the native diary opens directly and
  works offline. No demo account is required. Verify the review contact details
  and upload accurate native iPhone and iPad screenshots.
- Replace the attached 1.8.0 build 12 if it does not match the intended final
  release. On native devices, test first launch offline, diary and water tracking,
  food search, barcode scanning, restart persistence, backup export/import and
  recovery, and signed catalog updates.

## References

- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple: privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple: managing App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Open Food Facts terms](https://world.openfoodfacts.org/terms-of-use)
