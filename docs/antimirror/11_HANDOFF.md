# 11. Передача контекста

## Где остановились · 2026-09-13

S00 `d64a05c`, S01 `0b21080`, S02 `8d6ec0a`. S03 DONE; работа выполнена после S02.
Подробные факты — [S03 evidence](evidence/S03-2026-09-13.md). Следующий слайс S04.

## Следующее точное действие

Прочитать `slices/S04_LIFECYCLE_RECOVERY.md`, таблицу сбросов и recovery в
`02_STATE_AND_PROTOCOL.md`. Реализовать наблюдаемый media identity, history/hash fences,
BFCache/tab lifecycle и GET_TARGET_STATE reconciliation. Recovery должен сверять выбранный
target и сохранённые ancestor watchers; новое video при recovery не выбирать.

## Что работает

FrameCoordinator собирает native frame tree, адресно probe/discover, резервирует бюджеты:
4 concurrent scans, 64 frames, 25k visits/document и 100k/tab, search 3s. Пустые документы
имеют bounded фазы около 0/500/1500 ms. Ответ содержит complete/closedRoots/visits/frameCount;
расхождение DOM iframe count и browser tree даёт ограниченное покрытие, не ложный NO_VIDEO.

FrameBindings владеет discovered iframe refs и token binding через узкий postMessage.
BIND_CHILD → EMIT_BIND → READ_BIND устанавливает source WindowProxy mapping и geometry.
WATCH_CHILD → COMMIT_WATCH оставляют observers только выбранной цепочки; pending lease 5s,
вся фаза установки/commit watchers ограничена 1s. Page messages не включают отражение.
FRAME_LOST проверяется по runtime sender tab/frame и operation/nonce/token из state. Child
TARGET_LOST теперь принимает произвольный неотрицательный frameId, совпадающий с sender.

Background остаётся sole state writer и посылает PREPARE_APPLY ровно одной цели. CANCEL
чистит touched frames; RELEASE_DISCOVERY освобождает проигравшие refs/binds. Native session
сохраняет target и ancestors без URLs. Worker wake не сбрасывает локальные effects/watchers,
но reconciliation всё ещё TD02. Navigation выбранного frame/предка сбрасывает ON; unrelated
ad navigation/removal сохраняет. permissions.onRemoved отменяет pending и активные операции.

## Проверено

26 unit tests, lint/types, обе MV3 builds и manifest audit — PASS.
Chromium 153.0.8010.12: production popup S01–S03, roots/frames, три уровня,
closed→iframe→closed, about:blank/srcdoc/sandbox, cleanup всех документов, lost ACK,
PREPARE/navigation race, fallback, frame cap и site access revocation через UI Chrome.

Firefox 155.0.1: production native content bind/watch/apply/commit и parent-removal report;
same/cross/nested/closed-chain/about:blank/srcdoc/blob/data/sandbox — PASS.
Это не полный Firefox action-popup/controller E2E. Обычная popup.html вкладка не имеет права
SET_ENABLED: sender.tab guard сохранён. Harness работает через native content protocol.

## Команды

`pnpm lint`; `pnpm typecheck`; `pnpm test:unit`; `pnpm build:chrome`;
`pnpm build:firefox`; `pnpm verify:manifests`;
`FIXTURE_PORT=4473 FIXTURE_FRAME_PORT=4474 pnpm test:e2e:chromium`.
Firefox: отдельный `FIXTURE_PORT=4573 FIXTURE_FRAME_PORT=4574 pnpm fixtures`, затем
`FIXTURE_PORT=4573 FIXTURE_FRAME_PORT=4574 pnpm test:frames:firefox`.
S02 native roots: `pnpm test:discovery:firefox` с работающим стендом.
Browser binaries — .browser-cache; Firefox path — FIREFOX_BINARY.

## Ограничения / долг

TD02: full worker recovery и ancestor-watch reconciliation — S04.
TD03: native fullscreen самого video Chromium возвращает conflict; container fullscreen
проходит — renderer/controls проверить в S05.
Blob/data iframe в текущем Chromium отсутствуют в getAllFrames и получают FRAMES_UNAVAILABLE;
Firefox native related-frame gate проходит. Не обходить это через parent DOM/debugger.
Ручной smoke, реальные сайты/VK, Firefox popup/site-access UI, Edge/Brave, PiP — NOT_RUN.
Синхронные browser/layout calls не дают hard real-time гарантии бюджета.
