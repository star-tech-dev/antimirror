# 10. Технический долг

Обновлено во время S06, 2026-09-13.

| ID | Severity | Конкретная проблема | Evidence | Почему отложено | Исправление / слайс | Статус |
|---|---|---|---|---|---|---|
| TD01 | Medium | `createMirrorEffect` сам не диагностирует conflict | S01 caller сравнивает фактическую матрицу до APPLIED и делает rollback | Ownership оставлен у content session, primitive остаётся малым | S05 расширяет compatibility matrix, но базовый дефект закрыт | CLOSED |
| TD02 | High | Recovery должен сверять target и ancestor watchers | S04: GET_TARGET_STATE/GET_WATCH_STATE, transitional records, pending cleanup; production natural idle + unchanged target/op/ON icon PASS | Реализовано в S04 | Адресная reconciliation без discovery, retry cleanup перед новым ON | CLOSED |
| TD03 | Medium | Native fullscreen самого video в Chromium не принимает additive transform; безопасный `TRANSFORM_CONFLICT` выбран как v1 boundary | S05 Chromium: fullscreen video conflict, fullscreen figure ON, styles/controls intact; Firefox renderer matrix PASS | Firefox native fullscreen/control toolbar smoke NOT_RUN; пользователь явно принял пропуск 2026-09-13 | V1 boundary документирован; менять backend только при найденном дефекте или новом требовании | CLOSED |

S04 закрыл TD02 реальным natural idle gate; Firefox full recovery пока verification gap.
S05 проверил runtime CSS priority conflicts, site animation и PiP policy; потеря собственного
Animation теперь имеет отдельный EFFECT_LOST status. Это не универсальный pixel-test при любом cascade.
Chrome blob/data frame-tree limitation описан в coverage/evidence как capability boundary,
не как обещанная поддержка. Firefox popup/site-access manual остаются verification gaps.

Firefox product flow/idle, реальные сайты и остальные непроведённые тесты перечислены в evidence
как verification gaps, а не как доказанные баги. Не снимать ограничения по одному unit mock.

S06 не открыл нового незакрытого implementation debt. Найденный restart action-title defect
исправлен и закрыт unit + full browser-process restart gate. Firefox natural event-page idle,
Edge/Brave, screen reader и дополнительные real-site smoke остаются verification gaps S07,
а не известными runtime-дефектами.
