# 04. Разрешения, фреймы, безопасность и совместимость

## Разрешения v1

| Declaration | Зачем | Ограничение |
|---|---|---|
| `host_permissions: ["http://*/*", "https://*/*"]` | Доступные сайты и cross-origin embedded players | Доступ может быть отозван/ограничен пользователем |
| Content matches для HTTP/HTTPS | Пассивный agent в доступных документах | Никакого поиска/flip до команды |
| `storage` | Native session state при сне background | Не история, не permanent enabled |
| `webNavigation` | Сброс при SPA/full navigation и frame tree | Обрабатывать только нужные активные сессии |
| `scripting` | Ручная инъекция в уже открытый документ без агента | Не сканировать все вкладки при установке |
| `commands` manifest key | Пользовательский shortcut | Это ключ manifest, не permission |

Не добавлять `tabs`, `activeTab`, `dom`, `webRequest`, `debugger`, `tabCapture`, `downloads`,
`unlimitedStorage`, `notifications`, `nativeMessaging` без доказанной потребности.
`tabs` namespace сам по себе не требует одноимённого широкого permission для каждого метода;
доступ к чувствительным Tab-полям должен проверяться согласно фактическим grants.

Почему не только activeTab: для поддержки embedded player с другим origin недостаточно
предполагать разрешение top page на все дочерние origins. Широкое покрытие фреймов —
осознанный компромисс в пользу задачи пользователя. Источники:
[S03](08_SOURCES.md#s03), [S19](08_SOURCES.md#s19).

**Критерий минимальности:** если в итоговой реализации scripting больше не используется,
удалить его. Не просить доступ для будущего OCR/автоподсказок. Не гарантировать принятие
пакета магазином: обоснование разрешений проверяется при публикации.
Политика: [S21](08_SOURCES.md#s21).

Режим «только activeTab с последующим optional-permissions onboarding» рассмотрен и
отложен: он усложняет одно действие пользователя и покрытие сторонних frames. Не реализовывать
параллельно два permission режима в v1. В UI обязательно различать permission-denied и no-video.

## Фреймы: один агент на Document

Background получает дерево frames и адресно вызывает агента каждого доступного документа.
Каждый агент видит собственный DOM и shadow roots. `allFrames` не отменяет проверки
permissions и запреты отдельных страниц. Не читать `iframe.contentDocument` чужого origin
как универсальный fallback и не перехватывать исключения с последующим объявлением успеха.

Обычные same/cross-origin iframe входят в основной объём. about:blank, srcdoc, blob/data
frames — capability-tested related-frame support. `match_about_blank` и
`match_origin_as_fallback` не являются универсальным bypass sandbox/CSP. Различия браузеров,
момент инъекции и программный fallback проверяются в S00/S03. Источники:
[S03](08_SOURCES.md#s03), [S04](08_SOURCES.md#s04).

В одном табе применяется ровно один PREPARE_APPLY. Сообщение всем frames допустимо для
отмены/поиска, но запрещено для слепого `setEnabled(true)`.

## Потеря вложенного iframe

Нельзя рассчитывать только на сообщение удаляемого iframe: его контекст может исчезнуть
раньше доставки сообщения. Для выбранного target строится цепочка frameId/parentFrameId
из browser API, и родительские content agents наблюдают embedding iframe-узлы этой цепочки.

Для сопоставления child frame с DOM iframe допускается **узкий одноразовый bind channel**:

1. BG знает проверенные child/parent frame identities и выдаёт pending bind token текущей операции.
2. Child отправляет родителю `postMessage` только с namespace, типом `FRAME_BIND` и этим token.
3. Parent находит iframe, чей `contentWindow === event.source`, среди discovered iframe hosts,
   включая находящиеся в доступных roots; проверяет pending token/operation/child identity.
4. Parent подтверждает соответствие через extension runtime; BG сверяет sender родителя
   с ожидаемым parentFrameId. После выбора остаётся watcher только нужного iframe.
5. Удаление iframe/его shadow host инвалидирует ровно соответствующую target-сессию.

Этот канал не принимает enable/disable/user-command, URL, код или HTML. Страница может видеть
postMessage и interferе с геометрией/DOM; token не считать криптографической границей от сайта.
Граница безопасности — trusted runtime sender + разрешённая операция BG. Сайт уже может
удалить собственное video; не пытаться гарантировать доступность на враждебной странице.
Не экспортировать extension capabilities в MAIN world.

Если цепочка не может быть полностью проверена из-за недоступного предка, сообщить
ограниченное покрытие, не заявлять гарантированный мгновенный target-loss reset. Базовый
поддерживаемый сценарий требует работающего bind/watch на всех доступных предках.
Нельзя сбрасывать режим при удалении любого произвольного iframe «ради простоты».

## Границы trust

- UI-команды принимать только от своего popup/document URL или browser commands handler.
- Content reports принимать только от своего extension sender с ожидаемыми tab/frame/document.
- Page DOM, attributes, titles, URLs и любые page messages — недоверенные данные.
- Payload type guards, finite numbers, array/string caps, timeout, operation guard обязательны.
- Нет externally_connectable API и content-script eval/dynamic remote code.
- Ошибки/статусы показывать через textContent; не вставлять HTML, пришедший со страницы.
- Не отдавать содержимое других вкладок отвечающему frame.
- Навигация и отозванные permissions приоритетнее поздней успешной команды.

## Приватность

Расширение работает локально. Нет внешних запросов, аналитики, истории посещений, кадров,
аудио, subtitles, titles, cookies, stream URLs и токенов в диагностике. Browser загрузка
самого видео сайтом не является запросом расширения; не обещать отсутствие сетевых запросов
у страницы как таковой.

Допустимые development logs: время, error code, request/operation ID, tab/frame IDs,
число кандидатов/roots/посещённых узлов, длительность этапов, coverage, причина cleanup.
Не сериализовать DOM nodes, sender.url или полные Error objects без санитизации.
Ring buffer ограничен, выключен в production либо хранит только обезличенные коды текущей сессии.
Incognito не включать автоматически; если пользователь разрешил — не смешивать/экспортировать
его диагностические данные. Remote debugging и профили пользователя не использовать в тестах.

## Матрица поддержки

| Среда | Цель v1 | Статус при создании пакета |
|---|---|---|
| Desktop Chrome stable | Основной release target | Реализация и live тесты ещё не выполнены |
| Desktop Edge / Brave stable | Chromium-совместимость с отдельным smoke | Не подтверждена |
| Desktop Firefox stable | Отдельная MV3 сборка и проверка extension APIs | Не подтверждена |
| Firefox ESR | Только после фактического прогонов выбранной версии | Не обещана заранее |
| Opera / Yandex / другие Chromium | Возможная совместимость | Не рекламировать без smoke |
| Safari, Android, iOS | Вне v1 | Не поддерживаются пакетом |
| Browser PiP / casting | Вне гарантии | Не считать DOM fullscreen аналогом PiP |
| DRM-видео | Не обходить защиту | CSS-поведение проверять, не обещать все сервисы |
| Chrome/Firefox internal pages, store pages, PDF viewer | Недоступно/вне гарантии | Понятный OFF reason |
| Canvas/WebGL player без видимого video | Вне v1 | Не пытаться отражать скрытый источник |

Минимальные номера браузеров назначить после capability spike и тестов; не перепутать
«API появился в версии X» и «весь продукт проверен начиная с X». Дату и версии фактических
прогонов записывать в evidence. Особенности Firefox MV3: [S09](08_SOURCES.md#s09).

## Открытые вкладки, update, uninstall

После установки существующие документы могут не иметь агента: нужен ручной fallback или
reload. После update/uninstall браузер может оставить уже применённые page modifications
до cleanup/перезагрузки. Использовать ctx invalidation и собственный dispose, но не обещать
атомарное восстановление страницы при принудительном уничтожении extension context.
При отключении/удалении расширения пользователь должен знать, что reload очищает остатки.

## Зафиксированная основа S00 (2026-09-12)

Для Firefox выбран manifest minimum 140.0 и
`browser_specific_settings.gecko.data_collection_permissions.required: ["none"]`.
Сборка не передаёт данные за пределы браузера. Это декларация для desktop Firefox,
не доказательство совместимости со всеми версиями начиная с 140.
Основание: [Firefox built-in consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/).
Реальные версии и границы capability-проверок — в evidence/S00-2026-09-12.md.
