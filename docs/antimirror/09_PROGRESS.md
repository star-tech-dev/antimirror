# 09. Прогресс

**Последнее обновление:** 2026-09-13. **Текущий этап:** S05 завершён.
**Следующий слайс:** S06, hardening и performance.

| Слайс | Статус | Evidence | Примечание |
|---|---|---|---|
| S00 Foundation + feasibility | DONE | [S00 evidence](evidence/S00-2026-09-12.md) | Chromium + Firefox native gates, natural MV3 idle |
| S01 Первый вертикальный сценарий | DONE | [S01 evidence](evidence/S01-2026-09-12.md) | Production popup E2E Chromium |
| S02 Deep discovery | DONE | [S02 evidence](evidence/S02-2026-09-13.md) | Production Chromium + Firefox native roots; budgets/cleanup |
| S03 Frame coordination | DONE | [S03 evidence](evidence/S03-2026-09-13.md) | Chromium full flow + Firefox native frame bind/watch |
| S04 Lifecycle + recovery | DONE | [S04 evidence](evidence/S04-2026-09-13.md) | Media/URL reset, real BFCache/discard/browser restart, natural idle recovery |
| S05 UX + compatibility polish | DONE | [S05 evidence](evidence/S05-2026-09-13.md) | Chrome/VK и Firefox native automation PASS; Firefox manual UI NOT_RUN, пропуск принят пользователем |
| S06 Hardening + performance | TODO | — | — |
| S07 Release candidate | TODO | — | — |

Допустимые статусы: TODO, IN_PROGRESS, BLOCKED, DONE. Ручной NOT_RUN gate не превращает
слайс автоматически в DONE. В evidence отдельно различать implementation и verification.

## Обнаруженный существующий код

До S00 репозиторий содержал только каноническую документацию, инструкции и fixture-lab.
Git status был чист; старого extension runtime, package.json и LICENSE не было.
Документы, навыки и стенд сохранены; генератор проекта не использовался.

## Последний завершённый запуск

S05 implementation: компактный локализованный popup, native browser command, фактическая
shortcut-подсказка, отдельные permission/media/playback/PiP/effect-loss reasons и расширенная
renderer matrix. 40 unit tests, lint/types, обе MV3 builds/manifest audit, 6 Chromium E2E,
Firefox production renderer/i18n harness, ручной Chrome shortcut/popup и публичный VK player —
PASS. Headed Firefox открылся в Selenium, но UI automation не смог подключиться к окну.
Firefox toolbar/fullscreen/RU UI остаются честно отмечены NOT_RUN; пользователь явно принял
этот verification gap 2026-09-13, поэтому S05 закрыт без заявления о Firefox manual PASS.

## Предыдущий запуск S04

S04: media/session ownership, history/hash fences, BFCache-safe dispatcher, native tab lifecycle,
GET_TARGET_STATE/GET_WATCH_STATE reconciliation и persistent pending cleanup. Same URL/пауза/
sync reparent сохраняют ON. 37 unit tests, lint/types, обе MV3 builds, manifest audit — PASS.
Chromium S01–S04 (4 specs), real BFCache, raw-CDP discard/full browser restart и настоящий
natural worker idle — PASS. Firefox native frame regression — PASS, full Firefox popup/recovery
и реальные сайты — NOT_RUN. TD02 закрыт; TD03 и compatibility проверки переходят в S05.

## Предыдущий запуск S03

S03: сбор кандидатов по browser frame tree, адресный fallback, native parent bind/watch,
общие budgets (4 concurrent scans / 64 frames / 100k visits / 3s), выбранная ancestor chain
в session state. Target/ancestor navigation/removal и отзыв host access дают OFF; реклама
не сбрасывает выбранный target. Inaccessible/omitted frames отличаются от NO_VIDEO.
26 unit tests, lint/types, обе MV3 builds, manifest audit, Chromium S01–S03 E2E и Firefox
native frame protocol — PASS. Полный Firefox popup и реальные сайты — NOT_RUN.
TD02/TD03 остаются OPEN. Следующий шаг S04.

## Предыдущий запуск S02

S02: iterative discovery open/closed/nested roots, late attach, added-subtree handling,
fresh IO и background ranking. Лимиты/ошибки дают incomplete; cancel/success/timeout очищают
временные ресурсы. Локальные target removal/reparent закрыты без полного lifecycle S04.
17 unit tests, lint/types, Chrome+Firefox builds и manifest audit — PASS.
Chrome 153: production E2E S01–S02, Firefox 155: production native-root gate — PASS.
TD03: native video fullscreen Chromium возвращает conflict; fullscreen container проходит.
Ручные реальные сайты и полный Firefox popup flow не проверены. Следующий шаг S03.

## Предыдущий запуск S01

S00 зафиксирован коммитом `d64a05c`. В S01 реализован popup → TabController → top-frame
content agent → PREPARE/APPLIED/COMMIT/COMMITTED → ON/OFF. State per-tab хранится в native
storage.session; action обновляется последовательно. Operation/document/target/media identity
отсекают stale ответы. Повторная инъекция и requestId идемпотентны. OFF очищает owned effect
и candidate references; таймер существует только у неподтверждённого apply lease.

Успешны lint, typecheck, 11 unit tests, Chrome/Firefox MV3 builds, manifest verification,
production popup E2E и S00 feasibility regression. Chrome for Testing 153.0.8010.12:
popup-open не активирует; ON/OFF, две вкладки, paused/no/multiple video, rapid cancel,
duplicate request/reinjection, current site style, reload race и protected page — PASS.

Нет блокеров перехода к S02. S01 проверен только на synthetic top-level fixtures в Chromium;
ручной видимый smoke, Firefox product flow, реальные сайты, deep roots и iframe не заявлены PASS.
