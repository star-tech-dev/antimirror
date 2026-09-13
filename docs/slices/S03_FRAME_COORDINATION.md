# S03. Вложенные плееры и координация фреймов

**Зависимость:** S02. **Effort:** High. **Начальный статус:** TODO.

## Цель

Добавить frame tree, адресные probe/discover/apply и сбор кандидатов со всей вкладки.
Реализовать passive allFrames injection, manual fallback для уже открытых документов,
related-frame capabilities и parent-chain watchers выбранного iframe.

## Работа

Ограничить общую concurrency/число frames/время поиска. Проверять sender identities,
parent-frame bind и coverage. Выбранный child video меняется напрямую; iframe container
и другие frames не отражаются. Удаление постороннего iframe не сбрасывает цель.

## Definition of Done

Обычные same/cross-origin и nested iframe проходят; closed→iframe→closed проходит;
hidden iframe не выигрывает; удаление целевой цепочки выключает даже без child report.
Недоступные origins/related frames описаны корректно, без ложного no-video.

## Проверки

T21–T31, T47–T49, T60–T63, frame budgets T68. Unit-tests timeout, missing responses,
malformed candidate messages и отправки APPLY ровно одной цели.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Никаких blanket setEnabled(true) всем frames, global page-message enable или доступа
через debugger. Не отключать sandbox/CSP ради зелёного теста.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
