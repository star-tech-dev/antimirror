# S01. Первый полный ручной сценарий

**Зависимость:** S00. **Effort:** High. **Начальный статус:** TODO.

## Цель

Реализовать путь popup → background → обычный video top-document → эффект → ON → OFF.
Сразу заложить versioned protocol, operation/document identities, single-writer TabController,
native session-store и disposable MirrorHandle, чтобы не выбрасывать вертикальный срез позже.

## Работа

Popup пока минимальный, одна кнопка и статус. Opening popup не запускает поиск. Первая
детерминированная selection работает для одного обычного video. ON только после подтверждения.
Сразу покрыть отмену во время apply и базовый top-document reload reset.

## Definition of Done

В двух вкладках состояния независимы; простой video действительно отражается и возвращается;
OFF освобождает активные ресурсы; отсутствующий video даёт понятный OFF. Повторная инъекция
не удваивает обработчики. Простой manual сценарий воспроизводится без DevTools команд.

## Проверки

T01–T05, T08–T09, T32, T45, T49–T50, базовые T51/T55. Unit-tests reducer и runtime guards;
реальный Chromium extension E2E.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Глубокие roots и coordinator будут далее. Не компенсировать их отсутствие flip всех video
или постоянным setInterval(querySelectorAll). Не добавлять временный global enabled.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
