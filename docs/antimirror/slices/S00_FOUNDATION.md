# S00. Основа и проверка рискованных механизмов

**Зависимость:** нет. **Effort:** High. **Начальный статус:** TODO.

## Цель

Инвентаризировать существующий репозиторий и аккуратно объединить пакет. Создать минимальный
WXT/TS vanilla scaffold только при отсутствии проекта. Подключить unit и настоящий Chromium
extension test harness; зафиксировать инструменты и обе MV3 сборки.

## Работа

Проверить native closed-root access в Chrome и Firefox extension context; проверить
paused additive scaleX на асимметричном video, исходном translate/scale и cleanup.
Проверить related iframe injection и native session storage. Сначала маленькие проверочные
примеры, затем один выбранный подход, а не универсальная библиотека обхода DOM.

## Definition of Done

Рабочий scaffold и lockfile; явные build:chrome/build:firefox --mv3; typecheck/lint/unit scripts;
verify-manifests; fixture runner; capability/evidence report с реальными версиями.
AGENTS/skills согласованы с фактическими командами. Если Firefox недоступен — явно BLOCKED gate,
не обещать cross-browser PASS.

## Проверки

T15, T25 (smoke), T51, T54, T70. Снять snapshot исходного transform/inline style и проверить
его сохранность после cancel. Проверить настоящий вызов closed-root getter, не page-provided ref.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Не реализовывать весь lifecycle и store UI. Не начинать восемь слайсов одновременно.
Не утверждать поддержку VK по синтетической странице.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
