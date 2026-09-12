# 09. Прогресс

**Последнее обновление:** 2026-09-12. **Текущий этап:** S00 завершён.
**Следующий слайс:** S01, первый ручной вертикальный сценарий.

| Слайс | Статус | Evidence | Примечание |
|---|---|---|---|
| S00 Foundation + feasibility | DONE | [S00 evidence](evidence/S00-2026-09-12.md) | Chromium + Firefox native gates, natural MV3 idle |
| S01 Первый вертикальный сценарий | TODO | — | — |
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

Созданы WXT 0.21.4 / TypeScript strict / vanilla scaffold, lockfile, Node/pnpm pins,
пассивный OFF content entrypoint, background status stub, popup-заглушка и ON/OFF PNG.
Добавлены adapter native shadow access и additive effect primitive без production activation.
Отдельный test-only addon проверяет native roots, transforms/cleanup и related frames.

Успешны typecheck, lint, 3 unit tests, обе MV3 builds и manifest/artifact verification.
Реальные браузеры: Chrome for Testing 153.0.8010.12 и Firefox 150.0.1 / 155.0.1, macOS 26.5 arm64.
В Chromium подтверждены принудительный restart и естественный 40-секундный idle worker,
сохранение native session и активного effect. Firefox session roundtrip подтверждён;
сон Firefox event page и полный controller recovery остаются для S04.

Нет блокеров перехода к S01. Реальные сайты/VK, fullscreen/native controls/PiP и release
не проверялись. S00 не является готовым пользовательским расширением.
