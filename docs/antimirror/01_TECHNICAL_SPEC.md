# 01. Техническое описание и архитектура

## Стек

WXT + TypeScript strict + vanilla HTML/CSS. pnpm с lockfile; Vitest для чистой логики;
Playwright для настоящего Chromium extension E2E; отдельная проверка Firefox.
Без Vue/React, state framework, DI-container, RPC-фреймворка и backend.

В S00 выбрать совместимые стабильные версии, проверить package engines, зафиксировать
Node и pnpm. Не назначать зависимости `latest` без lockfile. Если в существующем проекте
уже есть поддерживаемая конфигурация, не обновлять всё без необходимости.

Оба entrypoint оформляются через WXT: `defineBackground(...)` и
`defineContentScript({ ..., main(ctx) { ... } })`. Точные imports брать из установленной версии.
Не обращаться к DOM на верхнем уровне content-модулей, которые WXT анализирует при сборке.
Основание: [S01](08_SOURCES.md#s01).

## Три исполнительных контекста

```text
popup / browser command
          |
          v
background: TabController -> session store -> ActionPresenter
          |
          | адресные сообщения: tab + frame + document + operation
          v
content agent в каждом доступном документе
  DiscoverySession -> CandidateSnapshot -> TargetSession -> MirrorHandle
```

**Background** принимает доверенное намерение, выбирает ровно одну цель по результатам
фреймов, сериализует изменения, хранит краткоживущее состояние, обрабатывает навигацию
и меняет иконку. DOM ему недоступен и не нужен.

**Content agent** знает только собственный Document. Он проходит локальные shadow trees,
формирует кандидатов и по адресной команде отражает выбранный video. Не пытается читать
DOM cross-origin дочернего окна из родительского документа.

**Popup** — представление состояния, не его владелец. Закрытие popup не влияет на работу.
Открытие не запускает discovery. UI отправляет желаемое состояние, а не оптимистически
переключает собственный boolean без подтверждения.

## Структура проекта

```text
entrypoints/
  background.ts
  content/index.ts
  popup/index.html
  popup/main.ts
  popup/style.css
src/
  background/
    tab-controller.ts       # единственный писатель state
    session-store.ts        # native storage.session
    navigation.ts
    frame-coordinator.ts
    action-presenter.ts
  content/
    agent.ts               # пассивный bootstrap, dispatcher, singleton
    discovery.ts           # ограниченный обход
    shadow-access.ts       # browser-specific root getter
    candidates.ts
    target-session.ts      # target/media/lifecycle ownership
    frame-ancestry.ts       # наблюдение нужной цепочки iframe
    mirror-effect.ts       # один reversible handle
  shared/
    protocol.ts            # discriminated unions + runtime guards
    state.ts               # pure reducer / переходы
    constants.ts           # бюджеты/таймауты
    errors.ts
    disposable-scope.ts
    logging.ts
  platform/
    browser.ts
    capabilities.ts
public/
  icons/                   # отдельные ON/OFF PNG для action
  _locales/en/messages.json
  _locales/ru/messages.json
tests/
  unit/
  integration/
  e2e/
testing/fixture-lab/        # включён в документационный пакет
scripts/
  verify-manifests.mjs     # создать в S00
wxt.config.ts
vitest.config.ts
playwright.config.ts
package.json
pnpm-lock.yaml
AGENTS.md
.agents/skills/
docs/antimirror/
```

Это целевая группировка, а не требование немедленно создать пустой файл для каждого имени.
Модуль появляется вместе с логикой. Не переносить FSD/монорепозиторий из других проектов
пользователя в маленькое расширение. Доменная логика не импортирует UI и browser globals.

## Bootstrap и инъекция

Выбран **статически объявленный пассивный content agent** на HTTP/HTTPS, во всех доступных
frames, в ISOLATED world. `runAt: document_start`; `allFrames: true`;
`matchAboutBlank: true`; `matchOriginAsFallback: true` при поддержке целевого браузера.
Результат WXT-сборки проверить, не считать имена TS-опций именами manifest-ключей.
Основание: [S03](08_SOURCES.md#s03), [S04](08_SOURCES.md#s04).

В OFF bootstrap делает только регистрацию runtime-dispatcher и минимальных lifecycle handlers.
Нет обхода DOM, поиска video, observers, polling, вызова attachShadow и регистрации
активной сессии в background. Не отправлять FRAME_READY с каждой загруженной страницы,
если нет текущего поиска. Не добавлять заранее CSS, воздействующий на video.

Команда включения адресно опрашивает существующие frames через background. Для страницы,
которая была открыта до установки расширения, допустима программная загрузка того же
собранного агента по действию пользователя. Инъекция идемпотентна: один agent на документ,
повторный запуск не удваивает listeners/эффекты. При недоступности fallback — понятная
просьба обновить страницу, а не скрытая глобальная перезагрузка вкладок.

Новые frames во время текущего поиска принимают участие только до его deadline. Background
использует navigation events и ограниченные повторы сообщений; в Firefox пустой iframe может
получить content script позже `document_start`. После OFF новые frames ничего не ищут.

## Ownership и освобождение ресурсов

- `AgentLifetime`: пассивные runtime/lifecycle listeners документа.
- `DiscoverySession(operationId)`: walkers, очереди узлов, краткие observers/IO/timers.
- `TargetSession(operationId, targetId)`: ссылка на video, MirrorHandle, наблюдатели цели
  и цепочки предков, локальные media tokens.
- `FrameAncestrySession`: watchers только у iframe-предков выбранной цели.

Каждая активная сессия имеет `AbortController` и идемпотентный `dispose()`.
После завершения discovery во всех проигравших frames ресурсы немедленно освобождаются.
После выключения остаётся только AgentLifetime. Не полагаться на GC для отключения observers.

WXT context invalidation включить в cleanup; не обещать мгновенный cleanup после uninstall,
если браузер не доставил сигнал. Это отдельный тест и описанное ограничение.
Основание: [S20](08_SOURCES.md#s20).

## Состояние и хранение

`storage.session` хранит только активные/переходные записи и небольшой статус причины сброса.
`Map` в background — кэш, не единственный источник истины. DOM references и MediaStream
не сериализуются. Полные URL, query-токены, названия роликов и media-src туда не писать.
Для сравнения URL хранить временные отпечатки; исходные строки остаются только в памяти
документа/обработчика события и не попадают в логи. Отпечатки тоже считать чувствительными,
а не «анонимными» данными.

Сон worker: сессия сохраняется. Перезапуск браузера: OFF. Не заменять session area на
persistent local storage ради удобства или старого mock.
Основание: [S06](08_SOURCES.md#s06), [S07](08_SOURCES.md#s07), [S08](08_SOURCES.md#s08).

## UI и сборки

Action default icon — OFF. Для конкретной вкладки вызывать `action.setIcon/setTitle` с tabId.
Не путать `action.disable()` с выключением зеркальности: это сделало бы popup недоступным.
Состояния searching/applying показываются как переходные, не как подтверждённое ON.

`build:chrome = wxt build -b chrome --mv3`, аналогично Firefox с `-b firefox --mv3`.
WXT может по умолчанию выбрать для Firefox MV2; поэтому явный флаг и manifest-test обязательны.
Firefox MV3 background не считать Chromium service worker: проверить сгенерированный target.
Основание: [S02](08_SOURCES.md#s02), [S09](08_SOURCES.md#s09).

## Обязательные команды, создаваемые в S00

`pnpm dev`, `pnpm dev:firefox`, `pnpm typecheck`, `pnpm lint`, `pnpm test:unit`,
`pnpm test:e2e:chromium`, `pnpm build:chrome`, `pnpm build:firefox`,
`pnpm verify:manifests`, `pnpm fixtures`.

Команды созданы в S00 (2026-09-12). Зафиксированы Node 24.13.0, pnpm 10.29.2,
WXT 0.21.4 и TypeScript 5.9.3; остальные точные версии — в package.json/lockfile.
С S01 обычная сборка поддерживает ручной popup-сценарий для одного обычного video в
top-document. Deep roots и frame coordination остаются за S02–S03.

Feasibility использует отдельные entrypoints в `testing/extension/entrypoints` и `.output-spike`.
`pnpm build:spike:chrome` / `pnpm build:spike:firefox` включают их через ANTIMIRROR_SPIKE=1;
обычные builds не содержат тестовых команд. `verify:manifests` проверяет JS/HTML артефакты.
`pnpm test:e2e:chromium` проверяет production S01, `pnpm test:e2e:feasibility` — S00;
обе команды сами поднимают fixture-lab. Для `pnpm test:e2e:firefox` и
`pnpm test:worker-idle` предварительно запустить `pnpm fixtures` с теми же портами.
Подробный setup — в README. Native Firefox проверяется Selenium + временный addon,
Chromium — Playwright, естественный idle — отдельный raw-CDP harness без worker debugger.
