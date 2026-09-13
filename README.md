# AntiMirror / АнтиЗеркало

Desktop MV3-расширение вручную отражает по горизонтали один основной `HTMLVideoElement` в
текущей вкладке. Оно ищет видео в доступных iframe и author open/closed shadow roots, не меняет
родителей плеера и выключается при навигации, замене media или потере выбранной цели.

Версия `1.0.0` подготовлена как проверенный локальный release candidate. Firefox ID —
`antimirror@star-tech.dev`, сайт и поддержка — <https://star-tech.dev/>. Публикация заблокирована
до выбора LICENSE, подтверждения издателя, размещения privacy notice и доступа к store accounts.

## Использование

1. Откройте страницу с видео.
2. Нажмите иконку AntiMirror. Само открытие popup ничего не включает.
3. Нажмите **Turn on / Включить** или используйте назначенный browser shortcut.
4. Повторное действие выключает отражение только в текущей вкладке.
5. Язык popup переключается через селектор **EN / RU** и сохраняется локально.

Расширение выбирает один fullscreen или наиболее видимый основной video. Практически равные
кандидаты оставляют режим выключенным. Новый video после потери старого не подхватывается без
нового действия пользователя.

## Ограничения

- Canvas/WebGL без видимого video, browser PiP, casting, DRM/CSP/sandbox bypass не поддерживаются.
- Вшитые в кадр надписи отражаются вместе с видео; внешние DOM overlays не отражаются.
- Native fullscreen самого video в Chromium может вернуть безопасный `TRANSFORM_CONFLICT`;
  fullscreen-контейнер поддерживается.
- Недоступные iframe дают отдельную ошибку, а превышение бюджета поиска не выдаётся за
  «видео отсутствует».
- При принудительном update/disable старый browser context может не получить cleanup. Reload
  страницы снимает оставшийся визуальный эффект; это проверенная граница платформы.
- Media reuse внутри того же MSE/MediaStream без наблюдаемой смены identity может остаться
  нераспознанным.

## Privacy и permissions

Расширение не читает кадры или звук, не скачивает видео, не ведёт аналитику и не отправляет
данные во внешний backend. В `storage.session` сохраняются только временные per-tab identity,
фаза операции и SHA-256 fingerprint URL; исходные URL и media source не сохраняются.
Подробный inventory: [PRIVACY.md](PRIVACY.md).

Chrome требует раскрывать даже локальную обработку website content/browsing activity. Firefox
получает `data_collection_permissions: none`, поскольку расширение ничего не собирает и не
передаёт за пределы браузера. Готовая статическая privacy-страница и декларации находятся в
[`store-assets`](store-assets/).

| Разрешение | Зачем |
|---|---|
| HTTP/HTTPS hosts | Найти явно выбранное видео, включая сторонние embedded players |
| `webNavigation` | Выключить режим при смене URL/document и получить доступное frame tree |
| `storage` | Согласовать per-tab state при естественном сне MV3 background |
| `scripting` | По ручному действию загрузить агент во вкладку, открытую до установки |

## Требования и сборка

Нужны Node 24.13.0 (`.node-version`) и pnpm 10.29.2. Все зависимости зафиксированы в
`pnpm-lock.yaml` и используются только при разработке/сборке.

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm typecheck
pnpm test:unit
pnpm build:chrome
pnpm build:firefox
pnpm verify:manifests
```

Unpacked builds: `.output/chrome-mv3` и `.output/firefox-mv3`.

## Release packages

```sh
pnpm zip:chrome
pnpm zip:firefox
pnpm verify:release
```

Команды создают в `.output/` отдельные Chrome/Firefox ZIP и Firefox source ZIP. Source archive
содержит README, `.node-version`, package/lockfile, WXT config и только необходимые исходники.
Reviewer воспроизводит Firefox build командами:

```sh
pnpm install --frozen-lockfile
pnpm build:firefox
pnpm verify:manifests
```

Chrome Web Store требует ZIP с `manifest.json` в корне; Firefox AMO принимает ZIP/XPI и требует
source submission для bundled/minified кода. Перед фактической загрузкой повторно проверить
[Chrome preparation rules](https://developer.chrome.com/docs/webstore/prepare) и
[Firefox source submission](https://extensionworkshop.com/documentation/publish/source-code-submission/).

## Browser verification

| Среда | Подтверждено |
|---|---|
| Chrome for Testing 153, macOS arm64 | Production popup, shortcut, frames/roots, lifecycle, MV3 idle/restart, performance, permissions, toolbar и публичный VK smoke |
| Firefox 155.0.1, macOS arm64 | Native MV3 session, roots, frame protocol, renderer/i18n/command automation |
| Firefox manual UI | `NOT_RUN`; пользователь принял пропуск недоступной проверки |
| Edge / Brave | `NOT_RUN`; совместимость не заявлена как проверенная |

Automation:

```sh
pnpm test:e2e:chromium
pnpm test:e2e:feasibility
```

Для raw recovery и Firefox harness сначала запустите `pnpm fixtures` с теми же
`FIXTURE_PORT`/`FIXTURE_FRAME_PORT`, затем используйте `pnpm test:recovery-idle`,
`pnpm test:discard`, `pnpm test:browser-restart`, `pnpm test:e2e:firefox`,
`pnpm test:discovery:firefox`, `pnpm test:frames:firefox`, `pnpm test:ux:firefox`.

Текущий release checklist: [verification/RELEASE_CHECKLIST.md](verification/RELEASE_CHECKLIST.md).
Архитектура, evidence и точные границы находятся в [docs/antimirror](docs/antimirror/).
EN/RU store copy, permissions justification, promo tiles и localized screenshots подготовлены в
[`store-assets`](store-assets/README.md); графика воспроизводится командой `pnpm generate:brand-assets`.
