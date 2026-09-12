# S04. Сбросы, гонки и восстановление MV3

**Зависимость:** S03. **Effort:** High. **Начальный статус:** TODO.

## Цель

Довести полную state/reset таблицу: SPA, hash, iframe ancestry navigation, target/media loss,
BFCache, discard, worker suspend/restart и race-safe reconciliation.

## Работа

Обеспечить отмену async операций через generation/operation fences, двухстадийный apply
с pending cleanup и согласование transitional records. Navigation/off не должны ждать
долгого scan под mutex. Состояние не хранится только в живой Map.

## Definition of Done

Все reset cases выполняются; same-URL state update, pause и switch tab не сбрасывают.
Реальный idle worker не вызывает state/icon divergence. Late ACK/двойные запросы/потеря
ответа не оставляют permanent ghost flip. Локальная потеря цели снимает effect без BG ACK.

## Проверки

T28–T50, T61. Проверка idle без открытых worker DevTools и keepalive; inject controlled
delays/reordering/failures в тестовом build, не shipping debug endpoint.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Не лечить сон worker постоянными ping/ports. Не хранить enabled в local storage и не
восстанавливать новую цель после browser restart.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
