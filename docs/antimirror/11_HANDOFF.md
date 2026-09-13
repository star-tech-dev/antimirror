# 11. Передача контекста

## Где остановились · 2026-09-13

Все implementation slices S00–S07 завершены. S06: `056a17a`. Воспроизводимая S07 RC
конфигурация: `1016390e2e1188ef08a054cf3321da659281730d`. Подробности и хеши:
[S07 evidence](evidence/S07-2026-09-13.md), [release checklist](../../verification/RELEASE_CHECKLIST.md)
и корневой `PACK_MANIFEST.json`.

## Локальные RC artifacts

- `.output/antimirror-0.1.0-chrome.zip`
- `.output/antimirror-0.1.0-firefox.zip`
- `.output/antimirror-0.1.0-sources.zip`

Артефакты gitignored. Они дважды собраны byte-identical из `1016390e…`; `verify:release`
проверил root manifests, runtime/source allowlists, отсутствие test/dev markers и напечатал
SHA256. Не пересобирать их после изменения README/package/config без обновления hashes/evidence.

## Что проверено в S07

41 unit test, lint/types, обе MV3 builds/manifests, Chromium 153 production 8/8 и Firefox 155
native S00/S02/S03/S05 — PASS. Новый clean-profile gate проверил первую установку/активацию,
runtime reload и disable. При принудительном уничтожении context один WAAPI effect остаётся до
reload страницы; reload возвращает zero effects. Это TD04 `ACCEPTED`, не мгновенный cleanup PASS.

Настоящий toolbar popup в отдельном Chrome for Testing profile прошёл OFF → ON → OFF. Доступный
публичный VK Видео recording без авторизации прошёл `Looking for video… → Video mirrored → Off`.
Firefox manual UI остаётся NOT_RUN по принятому пользователем пропуску; Edge/Brave и screen
reader также NOT_RUN.

## Следующее точное действие владельца

До публичной submission владелец должен выбрать LICENSE, подтвердить product/publisher name,
заменить `antimirror@local.invalid` на стабильный Firefox add-on ID, дать support contact и
hosted privacy-policy URL, подготовить store accounts/listing assets/declarations и явно поручить
upload. После любого такого изменения: обновить version/manifest/docs, выполнить полный release
checklist, пересобрать три ZIP, обновить SHA256 и только затем отправлять на review.

## Команды

```sh
pnpm install --frozen-lockfile
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

Для recovery/Firefox сначала запустить `pnpm fixtures` на тех же свободных
`FIXTURE_PORT`/`FIXTURE_FRAME_PORT`; точные команды находятся в README. Не публиковать, не push
и не создавать store identifiers/credentials без отдельного поручения владельца.
