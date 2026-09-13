# 11. Передача контекста

## Где остановились · 2026-09-13

S00 `d64a05c`, S01 `0b21080`, S02 `8d6ec0a`, S03 `935e413`, S04 `3b26990`,
S05 implementation `96b332e`, S05 docs `2fbfe82`. S06 DONE; подробности —
[S06 evidence](evidence/S06-2026-09-13.md). Рабочее дерево S06 должно быть продолжено с
коммита, указанного в `git log` после этой передачи.

## Следующее точное действие

Прочитать `slices/S07_RELEASE_CANDIDATE.md` и выполнить release-candidate checklist. Проверить
финальные unpacked/packaged artifacts, versioning, release docs и доступные обязательные browser
smoke. Не публиковать и не push без отдельного поручения. Firefox natural event-page idle и
manual UI остаются честными `NOT_RUN`; пользователь разрешил пропустить недоступную Firefox
проверку, поэтому не повторять тот же неработающий UI automation без новой возможности.

## Что добавил S06

Protocol и persisted session guards теперь используют exact allowlists для types/reasons,
safe integer IDs и строки длиной 1–128. Неизвестные error reasons, object-toString coercion,
oversized identities/areas, отрицательные tab IDs и malformed ancestor records отклоняются.

`tests/e2e/hardening.spec.mjs` проверяет page/content trust boundary, forged bind, malformed и
oversized extension messages, отсутствие MAIN-world capability, OFF mutation storm, ресурсы ON,
100 циклов ON/OFF и большой DOM. В Chromium 153: ON p95 41.30 ms, OFF p95 8.30 ms; cleanup
возвращает observers/IO/timers/animations к нулю. Large DOM завершился за 103.62 ms с 25 001
TreeWalker calls (25k protocol budget + terminal call), корректным incomplete и 0 ms long tasks.

Full browser restart обнаружил, что пустая после рестарта native session оставляла базовый
action title `AntiMirror`. Startup recovery теперь выставляет tab-specific `AntiMirror — OFF`
для вкладок без активного state. Persisted ON никогда не показывается до exact reconciliation
target/ancestor и ACK. Unit и повторный full-process restart подтверждают исправление.

## Проверено

`pnpm lint`, `pnpm typecheck`, 41 unit test, Chrome+Firefox production MV3 builds и manifest
audit — PASS. Chromium 153: 8 production tests / 6 specs S01–S06 и S00 feasibility — PASS.
Raw CDP production gates natural idle, discard и full browser restart — PASS. Firefox 155.0.1:
S00 native session/capabilities, S02 roots, S03 девять frame cases и S05 renderer/i18n/command —
PASS. Artifact review: нет app logs/network/eval/HTML injection/storage.local, test endpoints,
source maps, keys, remote code или лишних permissions. Критических/высоких открытых дефектов
по отдельному `antimirror-review` checklist не найдено.

## Команды и harness

Основной набор: `pnpm lint`; `pnpm typecheck`; `pnpm test:unit`; `pnpm build:chrome`;
`pnpm build:firefox`; `pnpm verify:manifests`; затем на свободных ports
`FIXTURE_PORT=5573 FIXTURE_FRAME_PORT=5574 pnpm test:e2e:chromium`.

Для recovery запустить отдельный `pnpm fixtures` с теми же ports и выполнить
`pnpm test:recovery-idle`, `pnpm test:discard`, `pnpm test:browser-restart`. Firefox native
regression: `pnpm test:e2e:firefox`, `pnpm test:discovery:firefox`,
`pnpm test:frames:firefox`, `pnpm test:ux:firefox`. Browser harness использует только временные
профили; raw CDP не подключается к production worker в natural-idle gate.

## Ограничения / долг

TD01–TD03 CLOSED; нового implementation debt в S06 нет. Firefox natural event-page idle нельзя
достоверно принудить текущим native harness и он остаётся `NOT_RUN`; session roundtrip PASS.
Firefox toolbar/fullscreen/RU manual UI, Edge/Brave, screen reader и дополнительные реальные
сайты — verification gaps для S07, не заявленные PASS. Native fullscreen самого video в
Chromium остаётся документированной безопасной границей `TRANSFORM_CONFLICT`; fullscreen
container работает. Chromium blob/data frame-tree omission остаётся `FRAMES_UNAVAILABLE`.
