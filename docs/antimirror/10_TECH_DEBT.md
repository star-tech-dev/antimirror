# 10. Технический долг

Обновлено после S04, 2026-09-13.

| ID | Severity | Конкретная проблема | Evidence | Почему отложено | Исправление / слайс | Статус |
|---|---|---|---|---|---|---|
| TD01 | Medium | `createMirrorEffect` сам не диагностирует conflict | S01 caller сравнивает фактическую матрицу до APPLIED и делает rollback | Ownership оставлен у content session, primitive остаётся малым | S05 расширяет compatibility matrix, но базовый дефект закрыт | CLOSED |
| TD02 | High | Recovery должен сверять target и ancestor watchers | S04: GET_TARGET_STATE/GET_WATCH_STATE, transitional records, pending cleanup; production natural idle + unchanged target/op/ON icon PASS | Реализовано в S04 | Адресная reconciliation без discovery, retry cleanup перед новым ON | CLOSED |
| TD03 | Medium | Native fullscreen самого video в Chromium не принимает текущий additive transform; включение возвращает TRANSFORM_CONFLICT | S02 production E2E, Chrome 153.0.8010.12; fullscreen figure проходит | Выбор цели S02 работает; rendering compatibility относится к S05. Ошибка не скрывается ложным ON | S05: исследовать безопасный backend/ограничение native fullscreen, проверить Firefox и controls | OPEN |

S04 закрыл TD02 реальным natural idle gate; Firefox full recovery пока verification gap.
S05 должен также проверить runtime CSS priority conflicts и PiP: S04 диагностирует утрату
собственного Animation, но это не универсальный тест фактической картинки при любом cascade.
Chrome blob/data frame-tree limitation описан в coverage/evidence как capability boundary,
не как обещанная поддержка. Firefox popup/site-access manual остаются verification gaps.

Firefox product flow/idle, реальные сайты и остальные непроведённые тесты перечислены в evidence
как verification gaps, а не как доказанные баги. Не снимать ограничения по одному unit mock.
