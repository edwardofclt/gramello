# Gramello privacy policy

Effective date: September 22, 2026

Gramello is a food diary and calorie/macronutrient tracker provided by Edward
Herbert II. This policy explains how the Gramello app and its connected service
handle information. Contact
[gramello@edwardofclt.com](mailto:gramello@edwardofclt.com) with privacy questions
or requests.

## Information used by Gramello

- **Account information:** Your account identifier and the name and email address
  returned by the sign-in provider. Auth0 provides authentication. Passwords and
  sign-in credentials are handled through the authentication provider; the
  Gramello diary database does not store your password.
- **Nutrition information:** Food names, brands, diary dates, meal categories,
  amounts and units, calories, protein, carbohydrate and fat values, daily goals,
  and custom-meal names, ingredients and yields. These records and their
  timestamps are stored with your account identifier so they can be loaded on
  your signed-in devices.
- **Water intake information:** Daily water goals, preferred display units,
  water amounts, entry dates, and timestamps are stored with your account
  identifier and synchronized across your signed-in devices.
- **Shared custom foods:** When you save a custom food to the shared food catalog,
  its name, brand, serving description, serving weight if supplied, and nutrition
  values become searchable by other users. The service stores your account
  identifier as the creator, but does not include that identifier, your account
  name, or your email address in food-search results. Custom foods are separate
  from your private diary and saved meal recipes. Do not put personal information
  in a shared food's name, brand, or serving description.
- **Search and barcode information:** Food-search terms and product barcodes are
  sent to the Gramello service to retrieve food information. Queries are passed
  to USDA FoodData Central and/or Open Food Facts as appropriate. Gramello does
  not include your account name, email, or sign-in token in those food-provider
  requests.
- **Technical information:** When you connect to Gramello or its providers, those
  services receive connection and request information, such as an IP address,
  request time, and browser or device information. Hosting and authentication
  services may keep operational and security logs. Auth0's authentication logs
  can associate sign-in events, IP addresses, device/browser information, and an
  approximate location derived from the IP address with your account. Gramello
  does not request your device's location permission for this purpose.
- **Support information:** Information you choose to email us, including your
  contact details and any details you supply to investigate an issue.
- **Anonymous app usage:** When analytics is enabled in an iOS or Android build,
  Segment receives app lifecycle events, screen names, and actions such as
  completing a search or saving/removing a diary entry, meal, goal, or water
  entry. These events include a random identifier stored for that installation,
  event identifiers and times, and app, operating-system, and analytics-library
  versions. They do not include your account identifier, name, email, sign-in
  tokens, search terms, barcodes, food/recipe contents, nutrition or water values,
  or diary dates. The app does not send device identifiers or device names to
  Segment. Analytics event IP addresses are replaced with 0.0.0.0; Segment still
  receives the network connection needed to deliver the events. The random ID
  is not linked to your Gramello account and is not shared across devices.

## Camera and device permissions

Camera access is used to read food barcodes. Barcode recognition happens on the
device; the recognized barcode is sent for product lookup. Gramello does not
upload or store camera photographs or video for this feature. You can decline
or revoke camera permission and enter a barcode manually. Gramello does not
request microphone access for barcode scanning.

The current app does not integrate with Apple Health/HealthKit or collect your
device's precise location, contacts, or photo library.

## How information is used

Information is used to authenticate you, keep your diary associated with your
account, synchronize saved entries and meals, calculate nutrition totals and
trends, retrieve food information, respond to support requests, and operate and
protect the service.

We do not sell your nutrition diary data or use it for targeted advertising.

## Usage analytics and advertising

Enabled iOS and Android builds use the anonymous Segment analytics described
in this policy to understand which features people use and improve the app.
We do not use these analytics events for advertising. The browser app and
marketing website do not include this analytics integration.

Advertising may be introduced in future versions; it is not active in the
current app or website. Before introducing advertising or changing analytics
data practices, we will update this policy with the actual providers,
information collected, purposes, sharing, retention, and available user choices.
We will provide any required notices and obtain consent where required before
new collection or sharing begins.

## Service providers and external services

- **Auth0** handles sign-in and account authentication.
- **Fly.io** hosts the connected Gramello service and its diary storage.
- **Twilio Segment** processes anonymous usage analytics from enabled iOS and
  Android builds. Its SDK stores the random installation identifier and queued
  events on the device so events can be sent when connectivity returns.
- **USDA FoodData Central and Open Food Facts** supply food-search and product
  information. Product images may load directly from their external image hosts,
  which receive the network information needed to serve those images.
- **Restaurant nutrition sources** supply the published menu data included in
  the app's food catalog. Catalog snapshots and source details are recorded in
  the public repository; searching that catalog does not send your account
  details to the restaurants.
- **Apple** handles App Store purchases and distribution. Gramello does not
  receive your full payment-card details. Apple handles payment information
  under its own policies.
- **GitHub** hosts these support and privacy pages and the public issue tracker.
  GitHub receives information when you visit or use its services. Anything you
  post in a public issue is public; use email for private support.

These providers process information under their own privacy policies and the
terms applicable to their services. Information may be processed in the United
States or other locations where the relevant providers operate. We may disclose
information when required by applicable law or necessary to protect the service
and its users.

## Website and cookies

The Gramello marketing, support, and legal website is hosted on GitHub Pages.
It does not ask you to sign in, submit a form, or enter diary information.
Fonts and website images are served with the site. The native app's analytics
and possible future advertising are described above. GitHub receives connection
information when it serves a page, including your IP address; see the
[GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).

Opening the connected Gramello app takes you to a separate service, where
necessary authentication cookies maintain your web session. The native app
uses its credentials manager instead. External services you choose to visit,
such as GitHub releases or Apple purchase support, follow their own policies.

## Storage and retention

Nutrition and water records are stored on the server under your account
identifier. The native app uses the operating-system-backed credentials manager for sign-in
credentials. The web app uses authentication cookies to maintain a session.

The analytics installation identifier persists across app restarts and sign-in
or sign-out. Accounts using the same installation share that identifier.
Clearing the app's stored data removes the local identifier and event queue;
restoring a device backup may restore them. Clearing local data does not delete
events already delivered to Segment. These events are not indexed by your
Gramello account identifier.

Diary entries, water entries, and saved meals remain stored until you remove
them or request their deletion. Removing a saved recipe does not remove previously logged diary
entries. You can edit your saved goals. Signing out or uninstalling the app does
not delete server records or the authentication account.

Shared custom foods remain in the common catalog. Contact support to request
correction or removal of a food you submitted; the app currently has no control
for deleting a shared custom food. Other users may already have logged its
nutrition values in their own diaries.

Deleted records may remain temporarily in backups. The service is configured to
retain automatic server-volume snapshots for 14 days. Authentication and hosting
providers may retain separate operational or security records according to
their own policies or legal obligations. HTTPS protects data in transit, but no
online service can guarantee absolute security.

## Your choices and requests

You can view your diary, edit your goals and saved recipes, remove individual
entries or meals, sign out, and change camera permission in your device settings.

For a copy of your data, correction of account information, or deletion of your
account and associated data, email
[gramello@edwardofclt.com](mailto:gramello@edwardofclt.com) from the address
associated with your account. We may ask for information needed to verify that
the account belongs to you. Do not send your password or a sign-in code.
Account-level deletion currently requires contacting support; removing the app
alone does not start a deletion request.

## Children

Gramello is not designed for children under 13. If you believe a child under 13
has provided personal information, contact us so we can investigate and remove
the information as appropriate.

## Changes to this policy

We may update this policy when the app or its data practices change. The
effective date above identifies the latest published version.

For product help, see [Gramello support](support.md).
