# AntiMirror privacy notice

**Version:** 1.0.0 · **Effective:** 2026-09-13 · **Support:** <https://star-tech.dev/>

AntiMirror changes the local display of one user-selected `HTMLVideoElement`. Processing happens
inside the browser. The extension has no analytics, advertising SDK, external backend or account.

## Data handled locally

- Numeric tab/frame identifiers and random operation/document/target tokens coordinate one active tab session.
- A SHA-256 fingerprint of the current top-level URL is kept in `storage.session` to detect navigation. The original URL, query string and fragment are not stored.
- Temporary state records the current phase, cleanup ownership and reason for switching off.
- The EN/RU popup language selected by the user is stored locally as a preference.

Session state is used only to perform the requested mirror action and reconcile an MV3 background
worker after sleep. It is not used as viewing history. The language preference contains no page or account information.

## Data not collected or transmitted

AntiMirror does not read, record, upload or sell video frames, audio, captions, page text,
cookies, credentials, browsing history or media source URLs. It does not transmit extension data
to the developer or third parties. Requests made by the website or video player are outside the
extension and continue according to that site's own policies.

## Site access

HTTP/HTTPS access lets AntiMirror find the selected video in ordinary pages and embedded players.
The content agent remains passive until the user presses the popup button or browser shortcut.
Protected pages, inaccessible frames, CSP, sandbox and DRM restrictions are not bypassed.

## Retention and control

Turning AntiMirror off removes its owned effect and active observation resources. Navigation,
media replacement and target loss also switch it off. If the browser forcibly disables, updates
or removes the extension before cleanup code runs, reloading the affected page removes any
remaining visual effect. Removing the extension deletes its local language preference.

Questions about this notice or AntiMirror can be sent through the support website:
<https://star-tech.dev/>.
