# 11. Передача контекста

## Где остановились · 2026-09-13

S00 `d64a05c`, S01 `0b21080`, S02 `8d6ec0a`, S03 `935e413`, S04 `3b26990`.
S05 implementation и Chrome/VK gates готовы; подробности —
[S05 evidence](evidence/S05-2026-09-13.md). Слайс остаётся IN_PROGRESS из-за Firefox manual gate.

## Следующее точное действие

В изолированном Firefox вручную проверить настоящий toolbar popup/shortcut, native fullscreen
controls и русскую UI locale. CUA не смог подключиться к Selenium-окну (`timeoutReached`),
поэтому использовать другой доступный headed harness или повторить на машине с доступным UI.
Если дефектов нет, закрыть TD03 и S05; S06 до этого не начинать.

## Что добавил текущий S05

Popup имеет одну toggle-control, a11y состояния и EN/RU native catalogs. Он показывает реальное
назначение browser command либо явную unassigned-подсказку. Background синхронно регистрирует
trusted `toggle-mirror` и переключает только активную вкладку через TabController.

Lifecycle reports теперь различают MEDIA_CHANGED, PLAYBACK_ENDED, PIP_UNSUPPORTED и EFFECT_LOST;
permissions revoke даёт PERMISSION_DENIED. Chromium matrix проверяет additive transforms,
`!important` conflict, site animation, current inline style после OFF, origin/backface, controls,
external overlay, PiP и fullscreen. Firefox production harness проверяет i18n/command declaration
и четыре renderer cases. Chrome physical shortcut и реальный публичный VK player прошли.

## Что добавил S04

`target-session.ts`: локальный snapshot media до PREPARE, source observer и события
emptied/loadstart/error/ended. O(1) watchdog ≤1Hz только выбранного video, без BG keepalive;
hidden polling paused, visibilitychange check. Own Animation cancellation снимает сессию.
Pagehide очищает effect/discovery/bindings и tombstones старые операции, но оставляет
пассивный dispatcher: настоящий BFCache остаётся OFF и допускает новое ручное включение.

`TabController`: top URL fingerprint, упорядоченные history/hash fences, немедленная отмена
pending operations при relevant navigation, discard/replace/remove. Target сохраняется в
applying ДО PREPARE. Startup/GET_STATE recovery проверяет exact committed target и все
committed ancestor watchers, top nonce/URL, не сканирует и не повторяет COMMIT.
Старые APPLIED/ошибки не выключают более новую операцию.

`SessionStore`: native `antimirror.tabs.v1` и `antimirror.cleanup.v1`.
OFF атомарно сохраняет старую identity для CANCEL retry; до очистки новая цель не выбирается.
Отсутствующий frame в native tree подтверждает cleanup. Невозможность прочитать storage
не маскируется успешной пустой инициализацией; popup получает ошибку чтения до нового boot.
URLs/media-src/DOM refs не сериализуются.

S03 deep/frame discovery и ограничения неизменны: 4 concurrent scans, 64 frames, 25k visits/
document, 100k/tab, 3s; selected chain watch lease. Native blob/data frame-tree omission в
Chrome даёт честный FRAMES_UNAVAILABLE; Firefox related-frame harness проходит.

## Проверено

37 unit tests, lint/types, Chrome+Firefox MV3 build и manifest audit — PASS.
Chromium 153.0.8010.12: 4 production specs S01–S04; real BFCache persisted=true,
same/new URL, media events/identity, late/lost ACK, reload/navigation, cleanup и host revoke.
Raw CDP: natural worker idle 40s без worker debugger, тот же target/op/ancestor+ON icon;
native discard/restore; полный browser process restart с тем же профилем и восстановленной
вкладкой — PASS. Firefox 155.0.1: 9 native frame/content scenarios — PASS.
Это не full Firefox action-popup/controller/idle gate.

## Команды и особенности harness

`pnpm lint`; `pnpm typecheck`; `pnpm test:unit`; `pnpm build:chrome`;
`pnpm build:firefox`; `pnpm verify:manifests`.
`FIXTURE_PORT=4673 FIXTURE_FRAME_PORT=4674 pnpm test:e2e:chromium`.

Для raw CDP и Firefox сначала отдельный
`FIXTURE_PORT=4773 FIXTURE_FRAME_PORT=4774 pnpm fixtures`, затем с теми же env:
`pnpm test:recovery-idle`, `pnpm test:discard`, `pnpm test:browser-restart`,
`pnpm test:frames:firefox`. Native root regression: `pnpm test:discovery:firefox`.

Playwright BFCache: ignoreDefaultArgs только для disable-back-forward-cache, goBack ждёт commit,
поскольку BFCache не генерирует load. Реальный discard выполняется raw CDP без target renderer
debugger: Chrome 153 macOS падал при discard Playwright-attached страницы. Не менять production
ради harness. Обычная popup.html вкладка по-прежнему не имеет права SET_ENABLED (sender.tab).

## Ограничения / долг

TD02 CLOSED. TD03 OPEN только до Firefox manual fullscreen/control gate: Chromium native
fullscreen video безопасно отклоняется, fullscreen figure проходит; renderer/PiP matrix готова.
Firefox toolbar/RU UI, full recovery/site-access UI, Edge/Brave — NOT_RUN.
Natural idle, BFCache и browser restart были автоматизированными browser gates, не manual smoke.
