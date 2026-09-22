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
| Price | US$0.99; base country United States |
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

The age questionnaire includes health/wellness topics, infrequent alcohol
references in food results, and user-generated content for shared custom foods.
Regional age-rating tables do not enable distribution outside the United States.

## Published privacy label

These seven categories are configured for **App Functionality**, **linked to the
user**, and **not used for tracking**:

- Name and email address: Auth0 account profile.
- User ID: authentication and ownership of stored records.
- Health: diary entries, nutrient amounts, and nutrition goals.
- Other User Content: saved recipes and shared custom-food submissions.
- Coarse Location: approximate sign-in location derived from IP addresses by Auth0.
- Other Diagnostic Data: authentication and service operational/security logs.

App Store Connect shows these disclosures as published. Recheck the final
release build and provider configuration, then update the label if data
practices change.

Camera frames are processed on-device for barcodes; the food lookup receives the
barcode, not camera images. The code does not include advertising or advertising
tracking SDKs. Auth0 logging is included even though the app does not request
device location permission.

## Remaining release work

- Accept Apple's Paid Apps Agreement in **Business**, then complete any banking
  and tax setup Apple requires. The agreement currently shows **New**.
- Confirm third-party content rights and complete the Content Rights declaration.
  Review attribution/license requirements for Open Food Facts data and images,
  USDA data, and the newly merged restaurant sources.
- Add in-app account-deletion initiation and ensure deletion covers Auth0 and
  account-linked server data. Email-only deletion support is not sufficient for
  an ordinary account-based App Store app.
- Expose the privacy policy and support contact inside the app.
- Review shared custom-food moderation/reporting safeguards against Apple's
  user-generated-content requirements before submitting version 1.8.0.
- Provide App Review with a working dedicated demo account and verify the review
  contact details in App Store Connect. Do not commit credentials to this repo.
- Upload accurate native iPhone and iPad screenshots for the release build.
- Confirm the attached 1.8.0 build 12 matches the intended final release. Test
  its authentication, account deletion, diary and water tracking, food search,
  barcode scanning, and server deployment on native devices before review.

## References

- [Apple: account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/)
- [Apple: App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple: privacy disclosures](https://developer.apple.com/app-store/app-privacy-details/)
- [Apple: managing App Privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy)
- [Auth0: personal information in logs](https://auth0.com/docs/deploy-monitor/logs/pii-in-logs)
- [Auth0: login history and location](https://auth0.com/docs/manage-users/user-accounts/view-user-details)
- [Open Food Facts terms](https://world.openfoodfacts.org/terms-of-use)
