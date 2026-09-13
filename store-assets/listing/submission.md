# Store submission declarations

## Single purpose

AntiMirror lets the user horizontally flip one selected HTML5 video in the active browser tab
without flipping the surrounding player interface.

## Permission justifications

| Permission | Reviewer-facing justification |
|---|---|
| `http://*/*`, `https://*/*` | Locate the user-requested HTML5 video, including videos in accessible embedded frames. The content script stays passive until the user activates AntiMirror. |
| `webNavigation` | Detect top-document and selected-frame navigation so the visual effect is removed and per-tab state is reset. |
| `storage` | Keep temporary per-tab coordination state across normal MV3 worker sleep and save the user's EN/RU popup preference. |
| `scripting` | Load the packaged content agent after a user action when a page was already open before the extension was installed. |

## Privacy dashboard

- Remote code: **No**.
- Data sold or transferred: **No**.
- Data sent to the developer or third parties: **No**.
- Chrome disclosure: declare local handling of **website content** and **web browsing activity** for **app functionality**. AntiMirror inspects video DOM metadata and keeps only a session-scoped SHA-256 URL fingerprint; it does not store the original URL or inspect video frames.
- Firefox manifest: `data_collection_permissions.required = ["none"]` because Mozilla's field covers collection and transmission outside the extension, which AntiMirror does not perform.
- Privacy notice source: [`../../PRIVACY.md`](../../PRIVACY.md).
- Host [`../privacy.html`](../privacy.html) at the proposed `https://star-tech.dev/antimirror/privacy` URL before submission.

## Listing assets

| Asset | Use |
|---|---|
| `../promo-small-440x280.png` | Chrome small promo tile |
| `../promo-marquee-1400x560.png` | Chrome optional marquee |
| `../screenshot-en-1280x800.png` | Localized English screenshot |
| `../screenshot-ru-1280x800.png` | Localized Russian screenshot |
| `../../public/icons/brand-128.png` | Store icon |

The screenshots are deterministic product illustrations matching the current popup and feature.
Before upload, compare them with the built extension after any UI change. Do not add rankings,
unsupported site claims, testimonials, or repeated keyword lists.
