# S05. UX, хоткей и совместимость отображения

**Зависимость:** S04. **Effort:** Medium–High. **Начальный статус:** TODO.

## Цель

Завершить компактный popup, русский/английский тексты, ON/OFF assets, keyboard/a11y,
customizable browser command, status/reason coverage. Пройти transform/native-player matrix.

## Работа

Показать searching/applying без ложного ON, ошибки permission/ambiguity/conflict отдельно.
Shortcut редактируется средствами браузера; отображать фактически назначенное сочетание.
Full-screen/overlays/native controls/captions проверяются на реальных браузерах.

## Definition of Done

В popup одна основная control, понятные состояния и русские/английские строки. Hotkey
работает либо ясно не назначен. Existing transforms/styles остаются живыми; unsupported
CSS conflict возвращает безопасный OFF, не ломая страницу. PiP сохраняет ON/target, хотя
отражение отдельного нативного PiP-окна не обещается.

## Проверки

T06–T07, T51–T59, T63–T65, T69. Manual Chrome/Firefox smoke + доступные реальные плееры.
Для VK записать конкретный результат, а не ссылку на предполагаемую структуру сайта.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Не делать options-page, темизацию, историю, auto-enable и onboarding-platform.
Не превращать incompatibility в бесконечную перезапись inline styles.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
