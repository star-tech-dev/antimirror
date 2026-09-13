# AntiMirror 1.0.0 local release checklist

Prepared 2026-09-13. `PASS` means the named local gate was executed. `NOT_RUN` and `BLOCKED`
are not release claims.

| Gate | Status | Evidence / action |
|---|---|---|
| S00–S08 complete; no critical/high defects | PASS | `docs/antimirror/evidence/` through S08 |
| Chrome + Firefox production MV3 manifests | PASS | `pnpm verify:manifests` |
| Branded store icons 16/32/48/128 and distinct OFF/ON shapes | PASS | SVG sources, generated manifests + PNG inspection |
| EN/RU popup selector persists without activation | PASS | unit + Chromium production E2E |
| Firefox ID `antimirror@star-tech.dev` and support homepage | PASS | generated Firefox manifest |
| EN/RU listing copy, privacy declarations and permission justifications | PASS | `store-assets/listing/` |
| Store graphics in required dimensions | PASS | icon, 440×280, 1400×560, EN/RU 1280×800 PNGs inspected |
| Chrome/Firefox runtime ZIP has root manifest and only allowlisted runtime files | PASS | `pnpm verify:release` |
| Firefox source ZIP is bounded and reproducible from lockfile | PASS | source allowlist + README build commands |
| Repeated package build is byte-identical | PASS | three SHA256 values matched across two builds from `4020756…` |
| No fixture/test API, localhost, source maps, keys, remote code or absolute | PASS | `pnpm verify:release`; S06 artifact review |
| Clean-profile install and manual first activation | PASS | `pnpm test:release-lifecycle` |
| Forced update/disable boundary | PASS with limitation | effect may remain immediately; page reload returns zero effect |
| Real Chrome toolbar popup | PASS | clean Chrome for Testing 153 profile; popup-open OFF, ON/OFF controls |
| Public VK Видео player | PASS | unauthenticated Chrome 153 smoke; `Looking for video… → Video mirrored → Off` |
| Firefox native production automation | PASS | Firefox 155 S00/S02/S03/S05 harnesses |
| Firefox toolbar/fullscreen/RU manual UI | NOT_RUN | unavailable UI automation; skip accepted by user |
| Edge / Brave smoke | NOT_RUN | compatibility is not advertised as verified |
| License choice | BLOCKED — owner | No LICENSE exists; owner must select terms before public source publication |
| Final publisher name | BLOCKED — owner | Product name is AntiMirror; dashboard publisher identity still required |
| Hosted privacy-policy URL | BLOCKED — owner | Host `store-assets/privacy.html` at the documented public URL |
| Store accounts and submission | BLOCKED — owner | Separate explicit publication instruction required |

Local RC artifacts may be tested and reviewed. The project is not fully ready for public store
submission until every owner-blocked row is resolved and the resulting manifests/packages are
rebuilt and rehashed.
