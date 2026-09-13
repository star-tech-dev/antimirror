# 09. Прогресс

**Последнее обновление:** 2026-09-13. **Текущий этап:** S08 завершён как локальный RC 1.0.0.
**Следующее действие:** LICENSE/publisher, hosting privacy page и store submission владельцем.

| Слайс | Статус | Evidence | Примечание |
|---|---|---|---|
| S00 Foundation + feasibility | DONE | [S00 evidence](evidence/S00-2026-09-12.md) | Chromium + Firefox native gates, natural MV3 idle |
| S01 Первый вертикальный сценарий | DONE | [S01 evidence](evidence/S01-2026-09-12.md) | Production popup E2E Chromium |
| S02 Deep discovery | DONE | [S02 evidence](evidence/S02-2026-09-13.md) | Production Chromium + Firefox native roots; budgets/cleanup |
| S03 Frame coordination | DONE | [S03 evidence](evidence/S03-2026-09-13.md) | Chromium full flow + Firefox native frame bind/watch |
| S04 Lifecycle + recovery | DONE | [S04 evidence](evidence/S04-2026-09-13.md) | Media/URL reset, real BFCache/discard/browser restart, natural idle recovery |
| S05 UX + compatibility polish | DONE | [S05 evidence](evidence/S05-2026-09-13.md) | Chrome/VK и Firefox native automation PASS; Firefox manual UI NOT_RUN, пропуск принят пользователем |
| S06 Hardening + performance | DONE | [S06 evidence](evidence/S06-2026-09-13.md) | Exact guards, security/stress automation, restart fix, artifact review |
| S07 Release candidate | DONE | [S07 evidence](evidence/S07-2026-09-13.md) | Local RC reproducible; public submission BLOCKED владельцем |
| S08 Release polish 1.0 | DONE | [S08 evidence](evidence/S08-2026-09-13.md) | ID/version/language/brand/listing assets; submission owner-blocked |

Допустимые статусы: TODO, IN_PROGRESS, BLOCKED, DONE. Ручной NOT_RUN gate не превращает
слайс автоматически в DONE. В evidence отдельно различать implementation и verification.

## Обнаруженный существующий код

До S00 репозиторий содержал только каноническую документацию, инструкции и fixture-lab.
Git status был чист; старого extension runtime, package.json и LICENSE не было.
Документы, навыки и стенд сохранены; генератор проекта не использовался.

## Последний завершённый запуск

S08: версия 1.0.0, Firefox ID `antimirror@star-tech.dev`, homepage/support `star-tech.dev`,
сохраняемый EN/RU selector без activation side effects, новый brand и отдельные OFF/ON icons.
Подготовлены локализованные listing copy/screenshots, promo tiles, permission/privacy declarations
и статическая privacy page. 43 unit tests, lint/types, обе builds/manifests, Chromium production
8/8 и Firefox native UX — PASS. Toolbar follow-up увеличил state artwork с 75% до 97% canvas;
обе builds/manifests и визуальный 16/128 audit прошли. Три ZIP дважды byte-identical из
`4020756…`. Firefox manual UI
остаётся NOT_RUN по принятому пропуску. До submission нужны LICENSE, publisher name, hosting
privacy page, store accounts и явное поручение на upload.

## Предыдущий запуск S07

S07: добавлены store-level icons, Chrome/Firefox shipping ZIP, bounded Firefox source ZIP,
автоматический archive allowlist/SHA256 gate, clean-profile install/update/disable harness,
актуальные README/privacy/changelog/checklist и evidence index. Артефакты дважды собрались
byte-identical из `1016390e…`. Chromium production 8/8, Firefox native S00/S02/S03/S05,
настоящий Chrome toolbar и публичный VK Видео smoke — PASS. Принудительные update/disable
оставляют WAAPI effect до page reload; reload подтверждённо очищает его, ограничение записано.
Firefox manual UI остаётся NOT_RUN по принятому пропуску. Публичная submission ожидает LICENSE,
metadata, стабильный Firefox ID, support/privacy URL, store accounts и отдельное поручение.

## Предыдущий запуск S06

S06: protocol/session guards закрыты exact allowlists и bounded identities; добавлены adversarial
trust-boundary E2E, OFF mutation stress, 100 ON/OFF циклов и large-DOM profile. Full restart gate
нашёл и после исправления подтвердил явный OFF action title для восстановленных вкладок при
пустой native session. 41 unit test, 8 Chromium production E2E, S00 regression, три raw-CDP
recovery gate, Firefox S00/S02/S03/S05 native automation, обе MV3 builds и artifact audit — PASS.
ON p95 41.30 ms, OFF p95 8.30 ms; cleanup возвращается к нулю. Firefox natural event-page idle
и manual UI остаются NOT_RUN в рамках принятого пользователем пропуска. Следующий шаг S07.

## Предыдущий запуск S05

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
