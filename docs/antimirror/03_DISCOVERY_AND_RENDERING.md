# 03. Поиск video и безопасное отражение

## 1. Доступ к shadow roots

Использовать общий `getAccessibleShadowRoot(element): ShadowRoot | null`:
обычный `element.shadowRoot`; при отсутствии — capability-checked Chromium
`chrome.dom.openOrClosedShadowRoot(element)`; в Firefox — расширенная
`element.openOrClosedShadowRoot`. Разницу изолировать в одном adapter и проверить в
реальном extension content context. Не выдумывать permission `dom`.
Основание: [S11](08_SOURCES.md#s11), [S12](08_SOURCES.md#s12).

API не нужно подменять `attachShadow`. Не запускать MAIN-world script на каждом сайте и
не патчить прототипы страницы ради уже существующих closed roots. Не обходить browser-internal
UA trees/controls, не мутировать shadow host. При отсутствии privileged accessor поддержать
open roots и вернуть ограниченную capability, а не заявлять closed-root coverage.

## 2. Ограниченный обход

Сессия поиска начинает с собственного Document. Итеративный TreeWalker/очередь roots
посещает **каждый Element**, поскольку shadow host может быть обычным div, а не custom element.
При посещении video добавить кандидата; при доступном shadow root добавить его в очередь;
при iframe сохранить ссылку для возможной привязки цепочки. Не рекурсировать в JS стек
на произвольную глубину, не перечитывать весь DOM после каждой мутации.

DocumentFragment в отсоединённом дереве и содержимое template не являются видимым плеером.
После присоединения они будут обнаружены по addedNodes. Для slot-раскладки избежать
повторного учёта одного video через WeakSet; при необходимости обработать assignedElements
с тем же visited guard. Обычное DOM-дерево и flattened/composed tree не считать идентичными.

Во время поиска: childList/subtree MutationObserver на Document и обнаруженных roots,
обработка только добавленных веток; удалённые кандидаты исключаются. Стили/class страницы
не нужно глобально отслеживать. Для кандидатов дополнительно проверяются текущие свойства.

**Поздний attachShadow к уже подключённому host** может не породить childList mutation
в исходном Document. Поэтому в пределах поискового окна предусмотрены максимум два
повторных бюджетированных host-pass. После успешного выбора все такие проходы прекращаются.
Видео, появившееся после завершения поисковой попытки, требует нового клика.

## 3. Бюджеты (стартовые, подлежат измерению)

| Константа | Стартовое значение | Поведение при исчерпании |
|---|---:|---|
| Общий deadline попытки | 3000 ms | Отмена, partial/incomplete reason |
| CPU-бюджет одного scan slice | 4 ms | Уступить event loop, затем продолжить |
| Одновременные сканы frames | 4 | Остальные в очереди той же операции |
| Проверяемые frames | 64 | Явное incomplete coverage, не молча игнорировать |
| Посещения элементов на frame | 25 000 | Incomplete coverage |
| Посещения элементов на tab за попытку | 100 000 | Общий stop, учитывая повторные проходы |
| Roots на frame | 256 | Incomplete coverage |
| Кандидаты на frame | 32 | Incomplete coverage; не делать ложный полный выбор |
| Повторный host-pass | около 500 и 1500 ms | Только если поиск ещё активен |
| Pending apply lease | 5000 ms | Локальный rollback без COMMIT |
| Целевой watchdog | не чаще 1 раза/s | Только O(1)-проверки выбранного video |

Сканинг всех frames суммарно ограничивается coordinator, а не только отдельным таймером
каждого iframe. Проверки времени и visited counter должны быть отменяемыми.
Использовать feature-tested scheduler; requestIdleCallback — необязательная оптимизация,
не единственный способ исполнения. Нельзя зависеть только от rAF: в hidden document он
может не выполняться в ожидаемый срок. Это не real-time система — задержки браузера
измеряются, а не скрываются увеличением таймаутов до бесконечности.

## 4. От кандидата к цели

Кандидат — реальный, подключённый HTMLVideoElement с ненулевым отображаемым размером и
доступным медиасостоянием. Отсеять hidden/display:none/visibility:hidden/нулевую opacity,
нулевое пересечение viewport, технические tiny-видео. Стартовый минимум — 64×36 CSS px,
это продуктовая эвристика, не браузерное ограничение.

Для геометрии использовать свежий IntersectionObserver entry с implicit root + bounds
кандидата. `rootBounds === null` в cross-origin frame не означает невидимость. Обработка
пересечений учитывает вложенные browsing contexts, но обычный IO не является полным
детектором перекрытия другими окнами/элементами. Основание: [S13](08_SOURCES.md#s13).

Ранжирование:

1. Видимый кандидат внутри актуального fullscreen-контекста имеет отдельный высший tier.
2. Внутри tier: `score = visibleArea * (playing ? 1.25 : 1)`.
3. Если у двух лучших одинаковый tier и отношение score меньше 1.15 — `AMBIGUOUS_TARGET`.
4. Opaque IDs нужны для адресации и стабильности логов, не как способ «разрешить» смысловую
   неоднозначность произвольным порядком DOM.

Коэффициенты валидировать на стенде и реальных плеерах. Учитывать browser fullscreen iframe
и локальный fullscreen video. Сильно трансформированные iframe могут делать оценку площади
приближённой; не заявлять идеальное сравнение всех CSS-сцен.

Технически недоступные frames отмечаются как `restricted/permission-denied/unresponsive`,
а не «пустые». При полностью недоступном плеере — объяснение доступа. Если есть одна
доказанно подходящая видимая цель среди доступных frames, можно включить её с coverage-warning;
при незавершённом из-за бюджета скане доступных frames не утверждать глобальный победитель.

**При выборе не вызывать play(), pause(), seek и не менять muted/volume.**
Воспроизводимое видео получает небольшое преимущество, но paused видео тоже поддерживается.

## 5. Движок отражения

Функциональное требование — горизонтальный flip. `rotateY(180deg)` из идеи не является
обязательным буквальным способом. Для плоского video предпочтителен **`scaleX(-1)`**:
он не вводит разворот лицевой/обратной стороны 3D-плоскости. `rotateY` при backface-visibility
и 3D-контексте требует дополнительных проверок. Основание:
[S14](08_SOURCES.md#s14), [S15](08_SOURCES.md#s15).

**Базовый путь, обязательный feasibility gate S00:** один принадлежащий расширению
постоянный приостановленный Web Animations effect с `transform: scaleX(-1)` и
`composite: 'add'`. Это позволяет не присваивать `element.style.transform` и отделить
наш эффект от исходных стилей сайта. Смысл композиции — transform сайта + локальное
отражение, а не арифметическое сложение matrix components. Основание:
[S16](08_SOURCES.md#s16), [S17](08_SOURCES.md#s17).

Пример **направления реализации**, не готовый production engine:

```ts
const effect = new KeyframeEffect(video, [
  { offset: 0, transform: 'scaleX(-1)' },
  { offset: 1, transform: 'scaleX(-1)' },
], { duration: 1, fill: 'both', composite: 'add' });
const animation = new Animation(effect, document.timeline);
animation.currentTime = 0; // не запускать бесконечный animation loop
animation.pause(); // S00 подтвердил currentTime=0 + pause() в обоих extension contexts.
// disable: animation.cancel(); удалить только принадлежащий handle.
```

В изолированном page-context Chromium при подготовке пакета простой пример применился
и обратимо снялся (см. `verification/PACK_CHECKS.md`). Это не заменяет extension/browser gate.
S00 подтвердил выбранную семантику currentTime/pause на Chrome for Testing 153 и Firefox 150;
см. [evidence](evidence/S00-2026-09-12.md). Статичный
owned effect выбран ради композиции и reversible cleanup, не ради видимой анимации.
Не вызывать commitStyles(): это запишет результат в inline style и нарушит ownership.
Не накапливать filling animations при повторных ON. Один handle — один video — одна сессия.

### Ограничения движка

Аддитивность не даёт магической совместимости: `!important`, CSS transitions, конкурирующие
WAAPI effects и 3D-матрицы способны изменить результат. Не считать существование Animation
объекта доказательством реального визуального flip. Проверить простой вычисленный результат
и визуальные fixtures; при обнаруженном конфликте вернуть `TRANSFORM_CONFLICT`.

Сохранять исходный transform-origin; не принудительно менять его на центр, position,
object-fit, z-index, backface-visibility и чужие индивидуальные rotate/translate/scale.
Нестандартный transform-origin и сложные 3D-сцены — отдельная проверка/ограничение.

Если spike докажет непригодность базового пути для обязательного сценария, агент должен
выбрать **один** минимальный альтернативный backend, подтвердить его fixtures и обновить
ADR. Не поддерживать три стратегии «на всякий случай». Возможный кандидат — композиция
individual scale при сохранении исходного scale; она не эквивалентна произвольному
добавлению к transform по порядку операций и требует собственных тестов.

Недопустимые fallback: `style.transform = 'rotateY(180deg)'`, запись всей style/cssText,
фиксация `getComputedStyle(transform)` в inline навсегда, оборачивание video в новый div,
переворот iframe, клонирование video, захват потока, перерисовка canvas и постоянная
борьба с CSS сайта через mutation loop.

## 6. Marker и cleanup

На выбранном video можно ставить `data-mirror-flip="1"` для диагностики, сохраняя его
исходное наличие/значение. **Атрибут не включает эффект самостоятельно.** Сайт может
подделать DOM marker; authority остаётся у приватного MirrorHandle/TargetSession.

При выключении отменяется только собственная Animation, снимаются observers/timers и
восстанавливается marker, если значение всё ещё принадлежит нашей сессии. Не удалять
чужие styles/animations и не восстанавливать старый snapshot поверх изменений сайта.
Отмена повторяемая и безопасная после удаления video/закрытия документа.

## 7. Наблюдение активной цели

После выбора нет полного DOM-сканирования. Следить за media events, собственной анимацией,
отсоединением video и его composed ancestors. Допустимо наблюдать childList цепочки
предков без subtree; при reparent того же узла пересобрать цепочку. Для удаления iframe
нужны watchers в родительских документах — см. [04](04_COMPATIBILITY_PERMISSIONS_SECURITY.md).

Локальный O(1) watchdog не чаще 1 Hz проверяет isConnected, identity srcObject/currentSrc,
валидность context и наличие handle. Он не посылает постоянные сообщения в background,
не читает кадры и не обходит DOM. В скрытой вкладке приостановить/существенно замедлить
его; по visibilitychange выполнить одну проверку. Браузерный throttling не считается
ошибкой. Обнаруженная локальная invalidation сначала снимает эффект, затем уведомляет BG.
