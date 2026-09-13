# 05. Стратегия тестирования и приёмка

## Уровни доказательств

- **Unit:** reducer, ranking, guards, дедупликация, timeout, cleanup ownership, mocked API failures.
- **DOM integration:** реальные DOM/WAAPI/IntersectionObserver в браузере на локальных fixtures.
- **Extension E2E:** собранное MV3-расширение с настоящими content scripts/background/permissions.
- **Manual smoke:** настоящий toolbar popup, браузерный shortcut editor, Firefox/Edge/Brave,
  VK Видео и другие доступные пользователю плееры.

Mock shadowRoot и успешный unit-test не доказывают privileged access к closed roots.
Открытый во вкладке `popup.html` не равен настоящему action popup: он меняет active-tab context.
Не подгонять production-логику определения вкладки под такой тест.

Playwright extension-сценарии строить через bundled Chromium + persistent context. Обычный
Playwright Firefox page-test не доказывает установленное Firefox-расширение. Для Firefox
использовать проверенный extension harness/web-ext/manual run и отдельно фиксировать способ.
Источники: [S22](08_SOURCES.md#s22), [S09](08_SOURCES.md#s09).

Если для автоматизации нужен тестовый extension entrypoint, включать его только в test build,
проверять его отсутствие в release manifest и не публиковать production debug-command API.
Реальные пользовательские gesture/toolbar проверки остаются отдельным manual gate.

S04 harness: `pnpm test:recovery-idle` использует production build и raw CDP только к страницам,
проверяя естественную остановку worker после 40 секунд без его debugger/keepalive.
`pnpm test:discard` проверяет реальный discard без debugger целевого renderer: Chrome 153
macOS падает при discard страницы, подключённой к Playwright. Это не обход production permissions.
`pnpm test:browser-restart` перезапускает собственный временный browser profile.
Для всех трёх команд заранее запустить `pnpm fixtures` с теми же FIXTURE_PORT/FIXTURE_FRAME_PORT.
Настоящий BFCache входит в lifecycle.spec: отключён только Playwright-флаг запрета BFCache,
проверяется pageshow.persisted=true; при back ожидается commit, поскольку нового load нет.

## Основные сценарии

| ID | Сценарий | Обязательный ожидаемый результат | Уровень |
|---|---|---|---|
| T01 | Новая/дублированная вкладка | OFF, нет эффекта | E2E |
| T02 | Только открыть/закрыть popup | Никакого DISCOVER/flip | E2E/manual |
| T03 | Одно обычное video, кнопка ON/OFF | Эффект реально применён/снят, статус согласован | E2E |
| T04 | A ON → B → A | В B OFF, в A прежний ON | E2E/manual |
| T05 | Независимо включить A и B | OFF в A не меняет B | E2E |
| T06 | Горячая клавиша | Переключает нужный tab, не вводит символы в страницу | Manual |
| T07 | Shortcut не назначен/конфликтует | Корректная подсказка, без «неработающего обещанного хоткея» | Manual |
| T08 | Нет video | OFF, no-video, поиск завершён, нет watchers | E2E |
| T09 | Видео на паузе | Доступно для выбора; расширение не вызывает play | E2E |
| T10 | Несколько одинаковых основных видео | OFF, ambiguous-target, объяснение | E2E |
| T11 | Основное video + мелкое превью | Изменено только основное | E2E |
| T12 | Hidden video огромного размера | Не выигрывает у видимого | E2E |
| T13 | Видео за рамками viewport | Не выбрать при ON; уже выбранное не выключить от scroll | E2E |
| T14 | Открытый shadow root | Найден и изменён video, не host | Extension E2E |
| T15 | Закрытый shadow root | Работает native privileged accessor | Extension E2E Chrome+Firefox |
| T16 | Вложенные open→closed→open roots | Найден video; нет дублей/стекового переполнения | Extension E2E |
| T17 | Поздний attachShadow на существующий div | Обнаружен в активном поисковом окне | Extension E2E |
| T18 | Подключить новую ветку с video в поиске | Incremental discovery, без полного rescan на мутацию | E2E |
| T19 | Video добавлен после no-video timeout | Остаётся OFF до нового действия | E2E |
| T20 | Slot и light DOM | Один target, без повторного отражения | E2E |
| T21 | Same-origin iframe | Корректная адресация дочернего документа | Extension E2E |
| T22 | Cross-origin iframe | Отражён child video, не iframe element | Extension E2E |
| T23 | Closed root → iframe → closed root | Полный доступный путь обнаружен | Extension E2E |
| T24 | Вложенные iframe 3 уровня | Выбран правильный Document; cleanup всей цепочки | Extension E2E |
| T25 | about:blank / srcdoc | Capability-confirmed поведение в обоих браузерах | Extension E2E/manual |
| T26 | blob/data iframe / sandbox | Поддержка либо честный restricted reason, без обхода | Extension E2E/manual |
| T27 | Огромное video в hidden cross-origin iframe | Не выбрать как видимое | Extension E2E |
| T28 | Удалить iframe с выбранным video | OFF, даже если child не успел отправить сообщение | Extension E2E |
| T29 | Удалить shadow host над выбранным iframe | OFF от watcher цепочки | Extension E2E |
| T30 | Перезагрузить рекламный iframe | Активная цель не меняется | Extension E2E |
| T31 | Перезагрузить выбранный iframe/его предка | OFF даже при прежнем URL | Extension E2E |
| T32 | Reload/top full navigation | OFF; старый ACK отвергнут | E2E |
| T33 | pushState / replaceState с новым URL | OFF без перехвата history в MAIN world | E2E |
| T34 | replaceState без изменения URL | Не сбрасывать только из-за объекта history state | E2E |
| T35 | hashchange / browser back / forward | OFF при фактической смене URL | E2E |
| T36 | Удалить video и вставить другой | OFF; новый не подхватывается | E2E |
| T37 | Синхронно reparent тот же video | ON, если к концу mutation batch он подключён | E2E |
| T38 | Изменить src/currentSrc/source/srcObject | OFF согласно media identity policy | E2E |
| T39 | MSE-сегменты, waiting, seeking, pause | Не сбрасывать без явного lifecycle/media reset | E2E/manual |
| T40 | `ended` / `error` / `emptied` | OFF, ресурсы сняты | E2E |
| T41 | BFCache pagehide/pageshow | Возвращение не включает прежнюю сессию | E2E/manual |
| T42 | Discard/restore/close tab | Нет dangling session и ложного ON | E2E/manual |
| T43 | Уснуть и разбудить MV3 worker | Тот же handle и согласованное ON | Extension E2E |
| T44 | Браузер полностью перезапущен | Все вкладки OFF, session state не восстановлен как preference | Manual |
| T45 | ON→OFF до окончания поиска | Late candidates не включают эффект | Unit+E2E |
| T46 | ON→OFF→ON, обратный порядок ACK | Только новая операция владеет эффектом | Unit+E2E |
| T47 | Потеря APPLIED/COMMITTED ответа | Pending lease/compensating cleanup, нет permanent ghost flip | Unit+E2E |
| T48 | Навигация между PREPARE и COMMIT | OFF; COMMIT старого документа отклонён | E2E |
| T49 | Duplicate requestId / content reinjection | Нет двойного toggle/handler/effect | Unit+E2E |
| T50 | Ошибка storage/action/sendMessage | Объяснимый безопасный статус; нет unhandled rejection | Unit+E2E |
| T51 | Прежний translate/rotate/scale transform | Сохранён и корректно составлен с flip | Real browser |
| T52 | Individual scale/rotate + animated transform | Проверенный результат либо явный conflict, не порча стилей | Real browser |
| T53 | `transform: ... !important` / transition | Отражение реально видно либо OFF/conflict | Real browser |
| T54 | backface-visibility и 3D parent | Нет исчезнувшего video от нашего 3D flip | Real browser |
| T55 | Site меняет стили во время ON | OFF возвращает текущие стили сайта, не старый snapshot | Real browser |
| T56 | Site отменяет свои/все animations | Без бесконечной войны и утечек; потеря нашего handle диагностируется | Real browser |
| T57 | Нативные controls / DOM overlays / captions | Зафиксированы реальные визуальные ограничения | Manual |
| T58 | DOM fullscreen / exit fullscreen | Тот же video ON, controls проверены | Manual+E2E |
| T59 | PiP/casting | Не рекламируется unsupported поведение; доступное событие обрабатывается | Manual |
| T60 | Page postMessage/marker пытаются включить | Ни один недоверенный канал не даёт enable | Security E2E |
| T61 | Неверные tab/frame/document/op IDs | Сообщение отклонено, другие вкладки не затронуты | Unit+E2E |
| T62 | Злонамеренный payload/большие массивы | Validation caps, нет HTML injection и зависания | Unit |
| T63 | Withheld/revoked host permissions | Отличается от no-video; нет скрытого запроса вне жеста | Manual |
| T64 | Protected browser/store pages | OFF + понятная причина, без исключений в popup | Manual |
| T65 | Страница до установки/после update | Idempotent ручной fallback либо предложение reload | Manual |
| T66 | OFF на mutation-heavy странице | Нет прикладного сканирования/observers/timers | Performance |
| T67 | 100 циклов ON/OFF | Ресурсы возвращаются к baseline, нет накопления Animation | Performance |
| T68 | Большой DOM / много frames / late roots | Бюджеты соблюдены, incomplete не выдан за no-video | Performance |
| T69 | Русский/английский, клавиатура, screen reader | Понятные статус и состояние кнопки, без color-only ON | Manual |
| T70 | Release manifest и артефакт | MV3 в обоих targets, нет test endpoints/remote code/secrets | Build+review |

## Производительность

Структурные требования обязательны независимо от машины:

- OFF: ноль **прикладных** active observers, DOM scan jobs и polling timers.
- ON: один target handle; discovery всех frames завершён; нет полного periodic rescan.
- Нет отправки кадров/медиаданных; нет worker keepalive.
- Все лимиты discovery учитываются, исчерпание явно видно в coverage.
- После cleanup количество собственных handles/listeners/observers возвращается к baseline.

Стартовые цели для измерения на зафиксированной машине: обычное переключение OFF p95 ≤200 ms;
ON на уже готовом простом/embedded player p95 ≤500 ms; сложный поиск завершается в пределах
заданного deadline с учётом разумной задержки event loop. Это **цели**, не достигнутые метрики.
Один собственный scan task не должен создавать long task >50 ms. Сравнивать 20 и более
итераций с baseline страницы, отдельно отмечать startup, закрытые roots, iframe и нагрузку.

S06 baseline на Chrome 153/macOS arm64: 100 циклов дали ON p95 41.30 ms и OFF p95 8.30 ms;
OFF mutation storm не создал прикладных observers/timers/DOM visits; large-DOM scan завершился
за 103.62 ms с bounded incomplete и без зарегистрированного long task. Полные условия и
instrumentation описаны в [S06 evidence](evidence/S06-2026-09-13.md).

Не писать «CPU 0%» по одному взгляду в task manager. Для локального watchdog отдельно
измерять вызовы/затраты и отсутствие wake-up background. Сам fixture MediaStream рисует
тестовую картинку — его нагрузка не относится к расширению, поэтому нужен baseline без него.

## Реальные сайты

Приоритет: VK Видео (обычный и embedded плеер, доступные live/запись), затем YouTube,
Twitch, Rutube и доступные пользователю другие видеосайты. Не утверждать, что каждый
использует shadow DOM: фиксировать фактически наблюдаемую структуру.

Не коммитить cookies, токены, персональные URL, страницы с приватными данными и copyrighted
видеофайлы. В воспроизводимых тестах использовать собственную асимметричную графику.
Если нет авторизации/доступного контента — `NOT_RUN`, а не «поддерживается по аналогии».

## Evidence

Для каждого gate: test ID, browser/version/OS, build SHA, дата, команда/действия,
ожидание, факт, PASS/FAIL/NOT_RUN/BLOCKED, screenshot/trace при необходимости.
Тестовые screenshots synthetic fixtures допустимы; не анализировать кадры пользовательских видео.
Artifacts держать в gitignored папке, а короткий отчёт — в docs/antimirror/evidence/.

Релиз требует прохождения критических T01–T05, T14–T17, T21–T24, T28–T38, T43,
T45–T56, T60–T68 и обязательных browser smoke. Unsupported сценарии могут завершаться
документированным корректным отказом, но не быть замаскированы зелёной галочкой «работает».
