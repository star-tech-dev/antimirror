# 11. Передача контекста

## Где остановились · 2026-09-13

Все слайсы S00–S08 завершены. S08 implementation: `faf38aa`; документация, входящая в
Firefox source archive: `4020756bdabf77cd0e88632323f2902c4c9b50ba`. Полные результаты:
[S08 evidence](evidence/S08-2026-09-13.md),
[release checklist](../../verification/RELEASE_CHECKLIST.md) и корневой `PACK_MANIFEST.json`.

## Локальные RC 1.0.0 artifacts

- `.output/antimirror-1.0.0-chrome.zip`
- `.output/antimirror-1.0.0-firefox.zip`
- `.output/antimirror-1.0.0-sources.zip`

Артефакты gitignored и дважды собраны byte-identical из `4020756…`. `verify:release` проверил
root manifests, runtime/source allowlists и отсутствие test/dev markers. Не пересобирать после
изменения README/package/config без обновления hashes/evidence.

## Что добавил S08

Firefox ID — `antimirror@star-tech.dev`; homepage/support — `https://star-tech.dev/`; версия —
1.0.0. Popup получил сохраняемый EN/RU selector. Смена языка читает packaged locale JSON,
сохраняет только `popupLocale` и перерисовывает background-owned state без `SET_ENABLED`.

Brand SVG и генератор создают store icon и различимые OFF/ON PNG на 16/32/48/128. В
`store-assets/` лежат EN/RU listing copy, permissions/privacy declarations, small/marquee promo,
localized 1280×800 screenshots и готовый к hosting `privacy.html`.
После проверки toolbar screenshot OFF/ON artwork увеличен с 96×96 до 124×124 внутри исходного
128 canvas; при 16 px это примерно 15.5 px вместо 12 px. Store brand padding не менялся.

## Проверки

43 unit tests, lint/types, обе MV3 builds/manifests и Chromium production 8/8 — PASS. Chromium
проверил EN→RU, persistence после reopen и RU→EN при OFF. Firefox 155 native UX regression с
новым ID — PASS. Firefox manual UI остаётся NOT_RUN по принятому пользователем пропуску.

## Следующее точное действие владельца

Выбрать LICENSE и окончательное publisher name. Разместить `store-assets/privacy.html` по
публичному HTTPS URL (в документах предложен `https://star-tech.dev/antimirror/privacy`). Затем
предоставить store accounts и явно поручить upload/submission. После изменения version/manifest/
README снова выполнить полный checklist и обновить hashes.

## Команды

```sh
pnpm install --frozen-lockfile
pnpm generate:brand-assets
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm test:e2e:chromium
pnpm build:chrome
pnpm build:firefox
pnpm verify:manifests
pnpm zip:chrome
pnpm zip:firefox
pnpm verify:release
```

Для Firefox/recovery сначала запустить `pnpm fixtures` на свободных согласованных портах.
Не публиковать, не push и не создавать store credentials без отдельного поручения владельца.
