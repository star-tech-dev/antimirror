# AntiMirror privacy notice — draft for owner approval

**Release candidate:** 0.1.0 · **Prepared:** 2026-09-13

AntiMirror changes the local display of one user-selected `HTMLVideoElement`. Processing happens
inside the browser. The extension has no analytics, advertising SDK, external backend or account.

## Data handled locally

- Numeric tab/frame identifiers and random operation/document/target tokens coordinate one
  active tab session.
- A SHA-256 fingerprint of the current top-level URL is kept in `storage.session` to detect
  navigation. The original URL, query string and fragment are not stored.
- Temporary state records the current phase, cleanup ownership and reason for switching off.

This state is used only to perform the requested mirror action and reconcile an MV3 background
worker after sleep. It is not written to persistent `storage.local` and is not used as viewing
history. Closing the browser session clears native session storage.

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
remaining visual effect.

Before publication, the owner must approve this notice and add the responsible publisher/support
contact and a stable public URL. Any future network feature or new data handling requires an
updated inventory and policy before release.
