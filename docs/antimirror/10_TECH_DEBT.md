# 10. Технический долг

Обновлено после S01, 2026-09-12.

| ID | Severity | Конкретная проблема | Evidence | Почему отложено | Исправление / слайс | Статус |
|---|---|---|---|---|---|---|
| TD01 | Medium | `createMirrorEffect` сам не диагностирует conflict | S01 caller сравнивает фактическую матрицу до APPLIED и делает rollback | Ownership оставлен у content session, primitive остаётся малым | S05 расширяет compatibility matrix, но базовый дефект закрыт | CLOSED |
| TD02 | High | После пробуждения background загруженный `on/applying` state пока не сверяется через `GET_TARGET_STATE` | `SessionStore.load`; протокол recovery ещё не реализован | Полный recovery и mismatch policy принадлежат S04; S01 E2E не перезапускает worker | S04: адресная reconciliation и action repair | OPEN |

Firefox product flow/idle, реальные сайты и остальные непроведённые тесты перечислены в evidence
как verification gaps, а не как доказанные баги. Не снимать ограничения по одному unit mock.
