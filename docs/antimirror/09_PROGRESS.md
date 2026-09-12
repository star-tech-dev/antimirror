# 09. Прогресс

**Последнее обновление:** 2026-09-12. **Текущий этап:** S01 завершён.
**Следующий слайс:** S02, deep discovery и выбор одной цели.

| Слайс | Статус | Evidence | Примечание |
|---|---|---|---|
| S00 Foundation + feasibility | DONE | [S00 evidence](evidence/S00-2026-09-12.md) | Chromium + Firefox native gates, natural MV3 idle |
| S01 Первый вертикальный сценарий | DONE | [S01 evidence](evidence/S01-2026-09-12.md) | Production popup E2E Chromium |
| S02 Deep discovery | TODO | — | — |
| S03 Frame coordination | TODO | — | — |
| S04 Lifecycle + recovery | TODO | — | — |
| S05 UX + compatibility polish | TODO | — | — |
| S06 Hardening + performance | TODO | — | — |
| S07 Release candidate | TODO | — | — |

Допустимые статусы: TODO, IN_PROGRESS, BLOCKED, DONE. Ручной NOT_RUN gate не превращает
слайс автоматически в DONE. В evidence отдельно различать implementation и verification.

## Обнаруженный существующий код

До S00 репозиторий содержал только каноническую документацию, инструкции и fixture-lab.
Git status был чист; старого extension runtime, package.json и LICENSE не было.
Документы, навыки и стенд сохранены; генератор проекта не использовался.

## Последний завершённый запуск

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
