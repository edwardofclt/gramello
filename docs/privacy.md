# Gramello privacy policy

Effective date: September 26, 2026

Gramello is a food diary and calorie/macronutrient tracker provided by Edward
Herbert II. This policy describes Gramello's account-free Android and iOS apps
and its website. Contact
[gramello@edwardofclt.com](mailto:gramello@edwardofclt.com) with privacy questions
or requests.

## No Gramello account; local diary storage

You do not need a Gramello account. Your diary, water entries, goals, saved meals,
and custom foods are stored on your device. We do not keep a server-side copy of
new personal tracking data in the native or main web app, or provide
account-based syncing between devices. The main web app stores its diary in this
browser's IndexedDB storage. Export a backup before clearing site data.

Earlier hosted-web versions and the retained Expo browser client use an
anonymous browser cookie and server storage. Those existing records are retained
for recovery. Custom foods created through the retained Expo browser client or
compatibility API are shared in the server food catalog and searchable by other
clients using that API. The main web app copies an existing hosted diary into an
empty local diary on first use, without deleting the server copy. Its Settings screen
can download that hosted diary while the original cookie is available. There is
no account login for recovery.

This does not mean that using Gramello involves no information processing.
The native apps send limited usage analytics, described below. Online food
lookups, website visits, purchases, and support requests also involve the
information described in this policy. Your health and nutrition records are
not included in usage analytics.

## Information used by Gramello

- **Personal tracking information:** Food and water entries, amounts, nutrition
  values, goals, saved meals, and custom foods provide your diary, totals, and
  trends. Native and main-web apps keep this data locally and do not upload it
  as a personal diary to Gramello's servers. The retained Expo browser client
  sends its diary changes to the compatibility server and shares custom foods
  through that server's food catalog, as described above.
- **Search and barcode information:** Online food-search terms and product
  barcodes are sent to food-lookup services, including USDA FoodData Central
  and/or Open Food Facts as appropriate, to retrieve nutrition information.
  These requests are separate from storing your personal diary.
- **Technical information:** When you connect to the website, food-lookup
  services, or other external services, those services receive connection and
  request information, such as an IP address, request time, and browser or
  device information. Providers may keep operational and security logs.
- **Support information:** Information you choose to email us, including your
  contact details and the details you supply to investigate an issue. Share only
  the personal or diary information needed to explain your request.
- **Usage analytics:** A randomly generated installation identifier, fixed action
  and screen names, event identifiers and timestamps, and app, operating-system,
  and analytics-library versions. These events contain no diary contents or
  health information. See Usage analytics below.

## Camera and device permissions

Camera access is used to read food barcodes. Barcode recognition happens on the
device; the recognized barcode is sent for product lookup. Gramello does not
upload or store camera photographs or video for this feature. You can decline
or revoke camera permission and enter a barcode manually. Gramello does not
request microphone access for barcode scanning.

Gramello does not integrate with Apple Health/HealthKit or collect your device's
precise location, contacts, or photo library.

## How information is used

Personal tracking data is used to save entries and meals, calculate nutrition
totals, and show trends. Native and main-web apps perform these operations
locally; the retained Expo browser client uses the hosted API. Online requests
retrieve food information. Support messages help us answer questions and investigate problems;
technical information helps providers operate and protect their services.

We do not sell your nutrition diary data or use it for targeted advertising.

## Usage analytics

The native iOS and Android apps use Twilio Segment for product analytics. This
helps us understand which features are used and improve Gramello. For example,
an event can record that someone opened Trends, searched for food, or logged
water. It does not contain what they searched for, ate, or drank, or any amounts.

The app creates a random installation identifier to group these events. It is
not derived from your name, email address, advertising identifier, or hardware
identifier. Gramello has no account to associate it with. We do not match this
identifier to your real-world identity or combine it with other companies' data
for advertising.

Analytics events include only that identifier, fixed event or screen names,
event identifiers and timestamps, app name/version/build, operating-system
name/version, and analytics-library name/version. They exclude food and water
entries, nutrition values, goals, saved meals, custom foods, diary dates, search
text, barcodes, names, email addresses, account profiles, device identifiers,
device names, and location. The event's IP-address field is replaced with
0.0.0.0; Segment still receives the network connection needed to process a
request.

Segment is currently the only recipient of these app analytics events; no
downstream analytics destinations are connected. These events are used only for
product analytics. We do not use them for
targeted advertising, cross-app advertising tracking, or identity matching, and
we do not send them to advertising destinations or data brokers. The marketing
website does not include this analytics integration. There are no advertising
integrations in the current app or website.

If these practices change, we will update this policy and provide the notices
and user choices required for the new collection or sharing.

## External services

- **Twilio Segment** receives the limited app usage events described above.
  No downstream analytics destinations are currently connected. See
  [Segment's privacy tools and policies](https://www.twilio.com/docs/segment/privacy).
- **USDA FoodData Central and Open Food Facts** supply food-search and product
  information. Product images may load directly from their external image hosts,
  which receive the network information needed to serve those images.
- **Restaurant nutrition sources** supply published menu data included in the
  app's food catalog. Catalog snapshots and source details are recorded in the
  public repository.
- **Apple and Google** handle purchases and distribution through the App Store
  and Google Play. A store account is separate from Gramello. Gramello does not
  receive your full payment-card details; each store handles payment information
  under its own policies.
- **OneLink** handles the app-download links on our website and routes visitors
  according to their device. Visiting OneLink involves a request to that external
  service.
- **GitHub** hosts the website and public issue tracker. GitHub receives
  information when you visit or use its services. Anything you post in a public
  issue is public; use email for private support.

These providers process information under their own privacy policies and the
terms applicable to their services. Information may be processed in the United
States or other locations where the relevant providers operate. We may disclose
information we hold, such as support correspondence, when required by applicable
law or necessary to protect the service and its users.

## Website and cookies

The Gramello marketing, support, and legal website is hosted on GitHub Pages.
It does not ask you to sign in, submit a form, or enter diary information.
Fonts and website images are served with the site. The website does not send
the native app's Segment events or run advertising integrations. GitHub receives connection
information when it serves a page, including your IP address; see the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

The main tracker retains an anonymous diary cookie to recover older hosted data.
It uses IndexedDB and a service worker to store the local diary and offline app
assets. Personal API responses are not cached by the service worker. The retained
Expo browser client continues to use cookie-scoped hosted diary storage.
Gramello does not use account-authentication cookies. External services you
choose to visit, including OneLink and the app stores, follow their own cookie
and privacy policies.

## Storage and retention

Native and main-web personal tracking records are stored on your device or in
your browser. You control the device and any backups available through your
operating system or other backup tools.
Backup and removal behavior depends on your platform and settings; removing
the app may not remove a separate device backup. New native and main-web diary changes have no automatic server backup.
Use Settings to export a portable backup. Earlier hosted records are retained as
described above; new local changes are never added to that server copy.

Support correspondence is retained as needed to address your request and meet
applicable obligations. External providers may retain their own technical,
purchase, or support records under their policies. There is no Gramello account
record. Earlier hosted diary records and the retained Expo browser client's
records remain in server storage until removed by the host.

The random analytics identifier persists in app storage across launches.
Clearing app storage creates a new identifier; restoring a device backup may
restore the previous one. Events may be queued on the device until they can be
sent. Clearing local data does not delete events already sent to an analytics
service. Segment retains received events under its
[Data Retention and Deletion Policy](https://www.twilio.com/docs/segment/privacy/data-retention-policy)
and the retention settings for our workspace's plan. There is no separate
downstream analytics store connected. Contact us with questions about analytics
retention or deletion.

## Your choices and requests

You can manage diary entries, water entries, goals, and saved meals in the app,
and change camera permission in your device settings. Use your device and
backup settings to manage app storage and any separately retained backups.

Version 1.14.0 sends the limited usage events described above automatically and
does not have an in-app analytics switch. Camera permission controls barcode
scanning; it does not control analytics. We will update this section when
additional analytics controls are available.

For help or a privacy request concerning information you have sent us, email
[gramello@edwardofclt.com](mailto:gramello@edwardofclt.com). We may ask for the
information needed to identify and handle your request. Do not send passwords,
sign-in codes, or payment-card details. We cannot supply a server export of new local diary changes. Earlier hosted
records can be exported through the original browser cookie as described above.

Analytics records use the random installation identifier, not your name or
email. An email address alone does not identify those records. Contact us for
help with an analytics request; we will explain what information is needed and
what records we can identify. You do not need to send your diary to make a
privacy request.

## Children

Gramello is not designed for children under 13. If you believe a child under 13
has provided personal information to us, contact us so we can investigate and
remove information we hold as appropriate.

## Changes to this policy

We may update this policy when the app or its data practices change. The
effective date above identifies the latest published version.

For product help, see [Gramello support](support.md).
