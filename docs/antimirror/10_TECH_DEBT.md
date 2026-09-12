# 10. Технический долг

Обновлено после S03, 2026-09-13.

| ID | Severity | Конкретная проблема | Evidence | Почему отложено | Исправление / слайс | Статус |
|---|---|---|---|---|---|---|
| TD01 | Medium | `createMirrorEffect` сам не диагностирует conflict | S01 caller сравнивает фактическую матрицу до APPLIED и делает rollback | Ownership оставлен у content session, primitive остаётся малым | S05 расширяет compatibility matrix, но базовый дефект закрыт | CLOSED |
| TD02 | High | После пробуждения background загруженный `on/applying` state пока не сверяется через `GET_TARGET_STATE` | `SessionStore.load`; протокол recovery ещё не реализован | Полный recovery и mismatch policy принадлежат S04; S01 E2E не перезапускает worker | S04: адресная reconciliation и action repair | OPEN |
| TD03 | Medium | Native fullscreen самого video в Chromium не принимает текущий additive transform; включение возвращает TRANSFORM_CONFLICT | S02 production E2E, Chrome 153.0.8010.12; fullscreen figure проходит | Выбор цели S02 работает; rendering compatibility относится к S05. Ошибка не скрывается ложным ON | S05: исследовать безопасный backend/ограничение native fullscreen, проверить Firefox и controls | OPEN |

S03 расширил TD02: recovery должен сверять не только TargetRef, но и сохранённые ancestor
watchers. Обычный worker sleep не очищает их, однако forced-restart reconciliation ещё нет.
Chrome blob/data frame-tree limitation описан в coverage/evidence как capability boundary,
не как обещанная поддержка. Firefox popup/site-access manual остаются verification gaps.

Firefox product flow/idle, реальные сайты и остальные непроведённые тесты перечислены в evidence
как verification gaps, а не как доказанные баги. Не снимать ограничения по одному unit mock.
