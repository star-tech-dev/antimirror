# S07. Сборка кандидата и пакет для магазинов

**Зависимость:** S06. **Effort:** Medium. **Начальный статус:** TODO.

## Цель

Подготовить reproducible release candidates, source archive при необходимости, окончательный
README/ограничения, privacy/permissions explanations, проверенную browser matrix и release notes.

## Работа

Проверить чистые профили, install/update/disable flows, настоящий toolbar и доступный VK.
Собрать SHA256, версии инструментов, evidence index. Реквизиты и лицензию взять из проекта
или оставить конкретными владельческими blockers, не выдумывать.

## Definition of Done

Готовые проверенные локальные артефакты и честный release checklist. Непройденные обязательные
gates явно блокируют объявление fully ready. Никакого автоматического push/store upload.

## Проверки

Manual critical smoke, T64–T65, T70, весь docs/antimirror/06_RELEASE.md. Нет secrets,
fixture files, test API и лишних permissions в shipping package.

Канонические сценарии: [05_TEST_PLAN](../05_TEST_PLAN.md).
Все результаты фиксировать в evidence; NOT_RUN не равен PASS.

## Не делать

Не публиковать без отдельного поручения. Не превращать статус RC в обещание принятия
магазином или гарантию работы во всех Chromium forks.

## Завершение

Обновить [progress](../09_PROGRESS.md), [handoff](../11_HANDOFF.md),
[конкретный техдолг](../10_TECH_DEBT.md), затронутые решения/инструкции.
Применить [AI workflow](../ai/WORKFLOW.md). Не начинать следующий слайс,
если текущий блокирующий gate не пройден или пользователь ограничил текущий запуск.
