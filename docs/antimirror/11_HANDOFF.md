# 11. Передача контекста

## Где остановились · 2026-09-13

S00 `d64a05c`, S01 `0b21080`. S02 DONE; реализация и проверки описаны в
[S02 evidence](evidence/S02-2026-09-13.md). Следующий слайс — S03.

## Следующее точное действие

Прочитать `slices/S03_FRAME_COORDINATION.md` и относящиеся к нему разделы
`02_STATE_AND_PROTOCOL.md`, `04_COMPATIBILITY_PERMISSIONS_SECURITY.md`.
Подключить frame coordinator: адресация документам, frame ancestry, общие бюджеты вкладки,
доступные/недоступные frames. Сейчас controller отправляет только в frameId=0,
и guards TargetRef принимают только 0. Content не обходит iframe DOM.

## Реализовано

DiscoverySession: deadline 3s, slices 4ms, budgets 25k elements/256 roots/32 videos,
два host-pass и incremental addedNodes. Fresh IO snapshot возвращается после опустошения
очереди. complete сообщает завершение доступного обхода, closedRoots — capability.
Background rankCandidates выбирает один video; при open-only добавляет предупреждение.
Не терять rollback flow PREPARE/APPLIED/COMMIT/COMMITTED и cancel по operation identity.

watchTargetConnection — один observer на composed ancestor chain без subtree. Он закрывает
локальные T36–T37: removal/host removal снимают эффект, reparent сохраняет. Это ещё не полный
TargetSession S04: media identity/history events/watchdog/GET_TARGET_STATE предстоит сделать.
TARGET_LOST проверяет sender tab/frame и полный operation/document/target/media tuple.

В OFF только passive runtime/lifetime handlers; после успеха нет discovery IO/timers,
остаётся selected-target observer и owned Animation. Pending apply lease живёт до COMMIT.
Старый CANCEL не удаляет candidates новой попытки. Проигравшие DOM refs очищаются при PREPARE.

## Проверено

17 unit tests, lint/types, обе production MV3 builds и manifest audit — PASS.
Chromium 153.0.8010.12: production popup S01 regression + deep discovery, ranking,
late roots, slot, deletion/reparent, limits, OFF mutation storm и error/deadline cleanup.
Firefox 155.0.1: production native open/closed/nested/slot/secondary/late-shadow,
apply/commit/disable и фактические matrices — PASS.

Chromium E2E открывает настоящий action popup через raw CDP. Firefox discovery harness
использует extension page как отправителя runtime messages и сохраняет target видимым для IO.
Production test bridge отсутствует.

## Команды

`pnpm lint`; `pnpm typecheck`; `pnpm test:unit`; `pnpm build:chrome`;
`pnpm build:firefox`; `pnpm verify:manifests`;
`FIXTURE_PORT=4273 FIXTURE_FRAME_PORT=4274 pnpm test:e2e:chromium`.
Для Firefox запустить `FIXTURE_PORT=4373 FIXTURE_FRAME_PORT=4374 pnpm fixtures`, затем
`FIXTURE_PORT=4373 FIXTURE_FRAME_PORT=4374 pnpm test:discovery:firefox`.
Browser binaries — .browser-cache; Firefox path задаётся FIREFOX_BINARY.

## Не потерять / долг

TD02: session state после worker restart требует reconciliation в S04.
TD03: Chromium native fullscreen самого video даёт TRANSFORM_CONFLICT; fullscreen container
проходит. Проверку renderer/controls продолжить в S05, не считать весь fullscreen PASS.
Ручной headed smoke, полный Firefox action-popup flow, реальные сайты/VK и PiP — NOT_RUN.
Общие frame budgets не реализованы до S03. Budget 4ms cooperative, не hard real-time.
