# 02. Состояния, протокол и lifecycle

## Модель

Не хранить просто `enabled: boolean`. Минимальный discriminated union:

```ts
type Phase = 'off' | 'searching' | 'applying' | 'on' | 'disabling';
interface Identity {
  tabId: number;
  operationId: string;      // fresh UUID, не переиспользуется после перезапуска
  revision: number;         // монотонный номер внутри жизни записи
  topDocumentNonce: string;
}
interface TargetRef {
  frameId: number;
  documentNonce: string;    // fresh UUID для каждого Document
  documentId?: string;      // browser-provided, когда доступен
  targetId: string;         // локальный opaque ID video, не CSS selector
  mediaToken: string;       // локальная генерация ресурса, не src
}
```

`off` содержит reason и revision, но не активную цель. `searching/applying/on` содержат
operationId и topDocumentNonce; `on` обязательно содержит TargetRef и подтверждённый handle.
Детали реализации union разместить в shared/state.ts, не копировать типы между контекстами.

`documentNonce` создаётся content agent один раз на Document и переживает обычный сон
background. После reload — новый nonce. После BFCache того же документа nonce может остаться,
но локальная сессия уже сброшена, и её нельзя восстановить из одного nonce.

Background получает tabId/frameId/documentId из `runtime.MessageSender` и navigation API,
не из неподтверждённых полей payload. Содержимое сообщений валидировать в runtime.

## Команды и события

| Направление | Тип | Назначение |
|---|---|---|
| UI → BG | `GET_STATE` | Прочитать/согласовать состояние указанной пользовательской вкладки |
| UI → BG | `SET_ENABLED` | Явное desired=true/false, requestId; повтор запроса идемпотентен |
| commands → BG | `TOGGLE_ACTIVE_TAB` | Внутреннее событие от браузера, не от веб-страницы |
| BG → frame | `PROBE` | Получить nonce/capabilities, без поиска и включения |
| BG → frame | `DISCOVER` | Найти кандидатов в бюджете текущей операции |
| frame → BG | `CANDIDATES` | Ограниченный массив метаданных и coverage, без URL/HTML |
| BG → target | `PREPARE_APPLY` | Проверить текущую цель и поставить временный эффект с deadline |
| target → BG | `APPLIED` | Эффект установлен на конкретном video, не просто флаг записан |
| BG → target | `COMMIT` | Подтвердить ту же операцию после записи переходного состояния |
| target → BG | `COMMITTED` | Цель принимает владение эффектом до явного сброса |
| BG → frames | `CANCEL_OPERATION` | Прервать поиск/временный эффект только указанной операции |
| BG → target/ancestors | `DISABLE` | Убрать принадлежащие расширению ресурсы выбранной сессии |
| target/ancestor → BG | `INVALIDATED` | Потеря video, media, документа, iframe или эффекта |
| BG → target | `GET_TARGET_STATE` | Проверка состояния при пробуждении/взаимодействии |
| BG ↔ ancestors | `BIND_CHILD` / `WATCH_CHILD` | Привязка и наблюдение нужной цепочки iframe |

У каждого сообщения: protocolVersion=1, type, requestId (когда нужен ответ), operationId
для активной операции. Payload должен быть ограничен по размерам/количеству элементов.
На unknown protocol/type — безопасный отказ, не выполнение команды «по похожим полям».

Пакет не назначает конкретную RPC-библиотеку. Достаточно typed messages и нескольких guards.
Для поддержки callback/Promise differences сделать один небольшой adapter, протестировать
свою runtime.onMessage реализацию в обоих браузерах, не смешивать sendResponse и return Promise.

## Успешное включение

1. Доверенный UI/command фиксирует tabId на момент действия. Background сверяет, что это
   нужная активная вкладка, получает top-document identity и создаёт fresh operationId.
2. Записывает `searching`, запускает ограниченный поиск доступных frames. Поздние frames
   допускаются только до общего deadline. Иконка пока не ON.
3. Собирает кандидатов, проверяет coverage, выбирает один; ещё раз проверяет актуальность
   top URL/document и TargetRef. Привязывает iframe-предков.
4. `PREPARE_APPLY`: content проверяет identity, mediaToken, `isConnected`, пригодность видео;
   создаёт reversible handle и одноразовый pending timeout. Возвращает `APPLIED`.
5. Background проверяет, что за время ожидания не было OFF/navigation, сохраняет `applying`
   с подготовленной целью и посылает `COMMIT`.
6. Content подтверждает ту же операцию, отменяет pending timeout и возвращает `COMMITTED`.
7. Background повторно проверяет revision/operationId, сохраняет `on`, затем обновляет
   tab-specific action. Popup получает подтверждённое состояние.

Если ACK потерян/поздний или дедлайн истёк, нет «полу-включённого» режима: background
делает compensating DISABLE/CANCEL, content снимает неподтверждённый эффект по lease.
Если worker пропал между COMMIT и записью `on`, при восстановлении запись `applying`
проверяется адресно и либо согласуется с тем же подтверждённым handle, либо выключается.
Нельзя выбрать новое видео во время recovery.

Timeout не считать доказательством, что content не исполнил команду. После таймаута всегда
пытаться убрать временный/подтверждённый эффект той же операции. Команда старой операции
не должна снять эффект новой.

## Отмена и гонки

Один TabController сериализует изменения одной вкладки. Но он **не должен удерживать очередь
во время долгого scan/ACK**: записать переход, отпустить очередь, выполнять side effect,
а результат снова проводить через reducer с identity guard.

OFF/navigation немедленно отменяет AbortController, увеличивает revision и делает старые
результаты неактуальными. Слепое `await search(); state.on = true` запрещено.

Popup отправляет `SET_ENABLED(desired)`; повтор того же requestId не переключает режим второй
раз. Hotkey обрабатывается сериализованно: во время поиска означает отмену, а не ещё один поиск.
Быстрые ON→OFF→ON дают новый operationId; late ACK первого ON игнорируется и убирает только
свой временный эффект. Закрытие вкладки уничтожает запись и освобождает кэш.

Action API-вызовы тоже ставятся в последовательную очередь на вкладку: старый async setIcon
не должен завершиться после более нового и вернуть ложный ON. После flush проверить revision.
Иконка не является хранилищем истины.

## Таблица сбросов

| Событие | Результат | Примечание |
|---|---|---|
| Кнопка OFF / hotkey в ON/searching | OFF | Отмена всех ресурсов операции |
| Top-level committed navigation / reload | OFF | Даже при том же URL: другой Document |
| Top URL реально изменился через History API | OFF | Включая query; same-URL replaceState не сбрасывает |
| Hash реально изменился | OFF | Строгое правило v1, даже если это только якорь |
| Навигация выбранного iframe или любого его iframe-предка | OFF | Даже если URL сохранился |
| Навигация постороннего iframe | Без изменений | Не ломать режим из-за рекламных frames |
| Video/shadow-host/целевой iframe отсоединён | OFF | Проверить после текущего mutation batch |
| Тот же узел синхронно перемещён и уже подключён | Сохранить | Пересобрать наблюдение предков; не выбирать другой video |
| Узел удалён и позже появился новый/вернулся старый | OFF | Автоподхвата нет |
| Изменились src/currentSrc/srcObject или поколение источника | OFF | Консервативно; quality-switch с новым src тоже сбрасывает |
| `emptied` / новый `loadstart` у активной цели | OFF | Даже если URL ресурса пока выглядит прежним |
| `error` / `ended` у активной цели | OFF | Live обычно не генерирует ended до завершения |
| `pause`, `waiting`, `stalled`, `seeking`, `timeupdate` | Сохранить | Это не новая цель |
| Scroll, resize, временное отсутствие пересечения viewport | Сохранить | Не трактовать прокрутку как удаление |
| DOM fullscreen того же video | Сохранить | Не переносить эффект на контейнер |
| Browser PiP | Вне гарантии | При доступном enter-PiP событии выключить с причиной unsupported |
| Смена активной вкладки/окна | Сохранить | Каждая вкладка независима |
| `pagehide` | Локальный OFF + best-effort уведомление BG | В том числе перед BFCache |
| `pageshow` из BFCache | OFF | Не восстанавливать прежний handle автоматически |
| Tab discard / replace / remove | OFF / удалить запись | Восстановленная вкладка начинает выключенной |
| Обычный suspend/restart background | Согласовать, не сбрасывать автоматически | Режим может продолжать действовать в content |
| Browser restart | OFF | session storage не используется как persistent setting |
| Отзыв host permission | OFF + best-effort cleanup | Если контекст потерян, объяснить необходимость reload |
| Потеря собственного эффекта / неподдерживаемый CSS conflict | OFF + причина | Не воевать с сайтом бесконечной перезаписью |

Navigation events: webNavigation.onCommitted, onHistoryStateUpdated,
onReferenceFragmentUpdated; tabs.onRemoved/onReplaced/onUpdated(discarded) и локальные
lifecycle guards. События и URL-проверки дедуплицировать. Основание:
[S10](08_SOURCES.md#s10).

На committed navigation сначала синхронно инвалидировать старую операцию, затем выполнять
асинхронную запись. На history/fragment event временно закрыть commit fence до сравнения URL:
при реальном изменении инвалидировать операцию, при том же URL снять fence без сброса.
Результаты асинхронного сравнения привязать к порядку событий/revision. Медленный URL-hash
или storage вызов не должен пропустить ACK устаревшей страницы или сбросить same-URL replaceState.

## Наблюдение за media identity

Content хранит локально объект video, `currentSrc`, актуальные source-атрибуты и ссылку
`srcObject`. Отсылать наружу только opaque `mediaToken`. Сегменты HLS/DASH, buffered ranges,
время воспроизведения и длительность не являются идентификатором видео.

Не определять live через один `isFinite(duration)`: это не требуется функциональности v1.
Если тот же MSE/MediaStream меняет картинку без наблюдаемого события/identity change,
это известное ограничение. Не перехватывать сеть и MSE ради догадок.

## Восстановление background

Listeners регистрировать синхронно; затем общая initialization promise подготавливает store.
Каждый handler дожидается её, не теряя событие. Согласовывать только записи существующих
активных/переходных сессий, не сканировать DOM всех вкладок.

Для сохранённого ON спросить адресный `GET_TARGET_STATE`. Совпали documentNonce,
operationId, targetId, mediaToken и реальный handle — сохранить ON. Подтверждён mismatch — OFF.
Если ответ недоступен, не считать отсутствие ответа доказательством удаления video:
отменить принадлежащую сессию best-effort и показать статус «не удалось проверить»,
не выдавая неподтверждённое состояние за ON. Следующее взаимодействие повторяет reconciliation.

Не держать worker искусственно живым через ports, ping каждые несколько секунд или alarms.
Снятие эффекта при локальной потере цели должно работать до и независимо от ответа background.
