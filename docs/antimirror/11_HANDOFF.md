# 11. Передача контекста

## Где остановились · 2026-09-12

S00 закоммичен как `d64a05c`. S01 DONE и оформлен отдельным локальным коммитом после S00.
Production popup отражает один подходящий обычный video в top-document и снимает эффект.
Подробные команды и границы — [S01 evidence](evidence/S01-2026-09-12.md).

## Следующее точное действие

Прочитать `slices/S02_DEEP_DISCOVERY.md` и релевантные части
`03_DISCOVERY_AND_RENDERING.md`. Заменить локальный `document.querySelectorAll('video')`
на бюджетированный iterative discovery открытых/нативно доступных closed roots с candidate
snapshot и детерминированным ranking. Не начинать frame coordinator S03.

Сохранить двухфазный controller flow. Discovery должен вернуть максимум ограниченного payload;
после выбора очистить проигравшие DOM references и все временные observers/timers.
Существующий S01 намеренно считает два video неоднозначными; S02 заменит это ranking policy.

## Реализовано и проверено

`src/shared/protocol.ts` содержит version 1 guards; `src/shared/state.ts` — reducer и session
record guard. `TabController` один пишет per-tab state, сериализует action updates, ограничивает
request cache 64 элементами и компенсирует storage/action/send failures. Краткоживущая
`pendingOperations` закрывает OFF во время PROBE. User-triggered fallback использует `scripting`
только после неответившего PROBE. Content singleton хранится в isolated world.

Chrome for Testing 153.0.8010.12 production E2E открывает настоящий action popup и проверяет:
T01–T05, T08–T09, T32/reload race, T45, T49, sendMessage-ветку T50, базовые T51/T55.
Unit: 4 файла / 11 tests, включая reducer, guards и rollback после storage/action failure.
Chrome/Firefox MV3 builds и manifest verification проходят. S00 feasibility regression проходит.

## Команды

`pnpm lint`; `pnpm typecheck`; `pnpm test:unit`; `pnpm build:chrome`;
`pnpm build:firefox`; `pnpm verify:manifests`; `pnpm test:e2e:chromium`;
`pnpm test:e2e:feasibility`. Для свободных портов одновременно задавать FIXTURE_PORT и
FIXTURE_FRAME_PORT. Browser downloads находятся в gitignored `.browser-cache`.

## Не потерять

Popup URL проверяется в background, а переданный tabId повторно сверяется с активной вкладкой.
Popup-open ничего не включает. Content сообщения принимаются только от extension runtime.
PROBE ничего не сканирует. S01 discovery работает только после trusted SET_ENABLED и только
в top-frame. OFF не оставляет candidate refs, mirror, observers или polling; apply lease 5s
существует только до COMMIT. Старый operation не снимает новый effect.

E2E получает настоящий popup target через `chrome.action.openPopup()` и raw CDP attach,
потому что Playwright persistent context не публикует этот popup как обычный Page event.
Production extension не содержит test bridge. Direct CDP используется только тестом.

## Непроверенное / долг

Visible headed manual smoke — NOT_RUN. Firefox S01 popup flow — NOT_RUN; только production build.
Deep roots/ranking (S02), frames (S03), target/media/history lifecycle и full MV3 recovery (S04),
hotkey/UX matrix (S05), реальные сайты/VK, native controls/fullscreen/PiP — не реализованы или
не проверены. TD02: загруженный после worker restart state ещё требует GET_TARGET_STATE reconciliation.
