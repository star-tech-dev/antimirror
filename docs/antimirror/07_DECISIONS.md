# 07. Журнал архитектурных решений

**Приоритет:** текущая пользовательская задача → продуктовый контракт → технический контракт →
план слайсов. Старые allowlist/autostart документы относятся к предыдущей концепции.
Сохранять историю отдельно, не держать два противоречивых канонических ТЗ.

| ID | Решение | Причина / отвергнутый вариант | Статус |
|---|---|---|---|
| ADR01 | Vanilla WXT/TS, desktop MV3 | Маленький UI; UI framework и monorepo не нужны | Принято |
| ADR02 | Background контролирует вкладку | Popup короткоживущий; несколько frames должны согласоваться | Принято |
| ADR03 | Popup-open без активации | Не смешивать default_popup с onClicked; manual намерение явно | Принято |
| ADR04 | Один основной video | «Все video» портит previews/ads и не соответствует намерению | Принято |
| ADR05 | Strict URL/document/target/media reset | Не переносить ручное разрешение на новый контент | Принято |
| ADR06 | Native closed-root accessor | Без глобального attachShadow patch и MAIN-world bridge | Принято, browser gate |
| ADR07 | Passive static bootstrap + manual existing-page fallback | Поздние frames/related URLs; OFF без тяжёлой работы | Принято |
| ADR08 | HTTP/HTTPS hosts вместо только activeTab | Требуется широкий cross-origin player coverage | Принято, store review не гарантирован |
| ADR09 | Native storage.session | Sleep worker ≠ новая сессия; persistent enabled не нужен | Принято |
| ADR10 | Постоянный paused additive scaleX effect | Не затирает transform, снимается отдельным handle, без 3D backface | Принято по S00 synthetic gate |
| ADR11 | Нет автоматического retarget после потери | Явная граница ручного включения | Принято |
| ADR12 | Runtime identity + versioned protocol | Late ACK, frame reuse, reload и double injection | Принято |
| ADR13 | Бюджеты и короткое окно discovery | Удобство не оправдывает вечный global observer/polling | Принято |
| ADR14 | Нет OCR/ML/canvas/video capture | Не нужно v1; приватность, нагрузка и ошибки определения | Принято |
| ADR15 | Без site adapters до воспроизводимого failure | Общий алгоритм предпочтителен, но не обещает невозможного | Принято |
| ADR16 | Отдельный Firefox extension gate | Chromium page-тест не подтверждает Firefox API | Принято |
| ADR17 | Scope-файлы, а не система оркестрации ИИ | Один рабочий skill и один review skill достаточно | Принято |
| ADR18 | Parent watchers для целевой iframe-цепочки | Сообщение из уничтоженного child может не дойти | Принято |

## Изменение решения

Агент может самостоятельно скорректировать техническую деталь после конкретного failed test,
если сохраняет продуктовые инварианты. Записать: наблюдение, воспроизведение, альтернативы,
выбор, последствия, тесты, какие документы изменены. Дата и evidence обязательны.

Нельзя «исправить» трудный тест расширением scope, ослаблением ручной активации, выключением
Firefox или объявлением closed roots невозможными без проверки native extension API.
Также нельзя замолчать доказанную несовместимость, сохраняя рекламное обещание.

## Существующий репозиторий

S00 выполняет inventory: какие решения/модули уже реализованы, что соответствует новой v1,
что относится к старой версии. Существующие инструкции объединить, полезные тесты сохранить.
Не удалять рабочие файлы только ради буквального совпадения с рекомендованным деревом папок.

## S00 · 2026-09-12

Native root adapters подтверждены в extension contexts Chrome for Testing 153.0.8010.12
и Firefox 150.0.1 / 155.0.1. ADR10: `currentTime = 0` + `pause()` на отдельной Animation,
`composite: add`, cleanup через `cancel()`. На асимметричном video подтверждены матрицы,
исходные translate/rotate/scale, backface:hidden, 3D ancestor и возврат snapshot.
Это не отменяет будущую проверку conflicts/animations/real sites.

Тестовые entrypoints полностью отделены через ANTIMIRROR_SPIKE и `.output-spike`.
В release scaffold только OFF; диагностическая отправка команд не является продуктовой
активацией и отсутствует в обычных артефактах. Firefox minimum 140.0 выбран вместе с
декларацией `data_collection_permissions: { required: ['none'] }`.
Точные результаты: [evidence](evidence/S00-2026-09-12.md).

## S01 · 2026-09-12

Вертикальный срез использует versioned typed protocol и двухфазный apply/commit. Background
остаётся единственным писателем native session state; popup передаёт `desired`, tabId сверяется
с активной вкладкой, а action ON устанавливается только после COMMITTED. До PROBE background
создаёт краткоживущую operation identity: это закрывает обнаруженную E2E гонку ON→OFF→late PROBE
без записи фиктивного documentNonce в session storage.

Статический агент идемпотентен в isolated world. Если PROBE не отвечает после явного клика,
background один раз пробует программно загрузить тот же собранный agent в top-frame; поэтому
permission `scripting` фактически используется для вкладок, открытых до установки/update.
Проверка transform выполняется до APPLIED; несовпадение немедленно отменяет owned Animation.
Подробности и границы — [evidence](evidence/S01-2026-09-12.md).

## S02 · 2026-09-13

Discovery владеет очередями, IO, MutationObserver и timers. Порции 4 ms уступают event loop
через setTimeout; deadline 3000 ms проверяется также внутри очереди и геометрии. Это
cooperative budget, а не гарантия прерывания одного синхронного browser API. Лимиты:
25 000 посещений (включая два host-pass), 256 roots (включая Document), 32 video.
Added-subtree работа поступает через NodeList-итераторы, без rescan на каждую мутацию.

Content возвращает snapshot; background выбирает победителя. Fullscreen tier выше площади;
playback bonus 1.25, ambiguity ratio <1.15. `complete` и `closedRoots` разделены: отсутствие
native accessor оставляет open-root support с coverage-warning. Budget failure запрещает apply.

Для T36–T37 добавлен observer только цепочки предков выбранного video, без subtree/polling.
TARGET_LOST сначала снимает локальный эффект; background проверяет sender tab/frame и
operation/document/target/media identity. Media/history/worker recovery остаются в S04.

Native video fullscreen в Chromium возвращает TRANSFORM_CONFLICT, fullscreen контейнера
проходит. Backend не заменялся в discovery-слайсе; TD03 оставлен для S05. Native-root gates
Chrome 153 и Firefox 155 пройдены; Firefox harness использует production extension messaging.
