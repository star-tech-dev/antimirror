# АнтиЗеркало / AntiMirror — пакет для реализации в Codex

**Редакция:** 2026-09-11 · **Объём продукта:** desktop v1, только ручное включение.
**Статус:** S00–S03 завершены; ручной выбор одного video в shadow roots и доступных iframe.

Расширение горизонтально отражает один выбранный основной HTMLVideoElement в текущей
вкладке. Не скачивает и не анализирует видеопоток, не вмешивается в права доступа к контенту.
Рабочие имена: «АнтиЗеркало» / AntiMirror. Имя издателя и доступность названия
нужно подтвердить перед публикацией. Лицензия и реквизиты публикации в этом пакете не назначаются.

## Локальный запуск

Нужны Node 24.13.0 (`.node-version`) и pnpm 10.29.2. Зависимости зафиксированы lockfile.

```sh
pnpm install --frozen-lockfile
pnpm dev
# отдельно: pnpm dev:firefox
pnpm typecheck
pnpm lint
pnpm test:unit
pnpm build:chrome
pnpm build:firefox
pnpm verify:manifests
```

Сборки находятся в `.output/chrome-mv3` и `.output/firefox-mv3`. Popup включает и выключает
ровно один подходящий video во вкладке, включая open/closed/nested shadow roots и iframe.
Выбор учитывает fullscreen и видимую площадь; практически равные кандидаты оставляют OFF
с объяснением. Выбранная iframe-цепочка наблюдается отдельно; её удаление/навигация выключает
режим, посторонние рекламные iframe его не сбрасывают.

## Браузерные проверки

```sh
PLAYWRIGHT_BROWSERS_PATH=.browser-cache pnpm exec playwright install chromium
pnpm test:e2e:chromium
pnpm test:e2e:feasibility
```

Playwright сам запускает стенд. Если порты заняты, передать оба свободных порта:

```sh
FIXTURE_PORT=4273 FIXTURE_FRAME_PORT=4274 pnpm test:e2e:chromium
```

Для следующих команд сначала запустить `pnpm fixtures` в отдельном терминале:

```sh
pnpm test:e2e:firefox
pnpm test:discovery:firefox
pnpm test:frames:firefox
pnpm test:worker-idle
```

Firefox harness использует установленный `/Applications/Firefox.app/Contents/MacOS/firefox`;
на другой системе задать `FIREFOX_BINARY`. Geckodriver 0.36.0 загружается в `.browser-cache`.
Браузеры запускаются в отдельных временных профилях. Firefox harness использует
`--remote-allow-system-access` для WebDriver доступа к собственной служебной странице addon;
этот флаг не нужен пользователям расширения. `FIXTURE_PORT` должен совпадать
с запущенным стендом. Idle-проба ждёт 40 секунд без debugger attachment к worker.

`test:e2e:chromium` проверяет production popup, discovery и S03 frame coordination. `test:discovery:firefox`
проверяет production content через native extension messaging, сохраняя целевую вкладку
видимой для IntersectionObserver. `test:frames:firefox` проверяет native bind/watch, адресное
применение и parent-removal report production content. Это не полный action-popup E2E Firefox.
`test:e2e:feasibility` повторяет
низкоуровневые S00 gates. Тестовая сборка `.output-spike` содержит служебные команды и
**не предназначена для распространения**.
Снимки синтетического видео пишутся в gitignored `test-results`. Результаты и ограничения:
[S00](docs/antimirror/evidence/S00-2026-09-12.md),
[S01](docs/antimirror/evidence/S01-2026-09-12.md),
[S02](docs/antimirror/evidence/S02-2026-09-13.md),
[S03](docs/antimirror/evidence/S03-2026-09-13.md).

В текущем Chromium blob/data iframe могут отсутствовать в browser frame tree: вместо
ложного «видео не найдено» показана недоступность. В Firefox 155 эти native сценарии прошли.

Native fullscreen самого video в Chromium сейчас возвращает конфликт стилей; fullscreen
контейнера проверен. Совместимость этого режима остаётся задачей S05 (TD03).

Для продолжения использовать [CONTINUE_CODEX.md](CONTINUE_CODEX.md), для независимого review —
[REVIEW_CODEX.md](REVIEW_CODEX.md). Текущий следующий шаг указан в progress/handoff.

## Порядок чтения

| Файл | Назначение |
|---|---|
| [00_PRODUCT](docs/antimirror/00_PRODUCT.md) | Продукт, границы, точная трактовка требований |
| [01_TECHNICAL_SPEC](docs/antimirror/01_TECHNICAL_SPEC.md) | Архитектура и структура проекта |
| [02_STATE_AND_PROTOCOL](docs/antimirror/02_STATE_AND_PROTOCOL.md) | Состояния, сообщения, навигация, гонки, MV3 |
| [03_DISCOVERY_AND_RENDERING](docs/antimirror/03_DISCOVERY_AND_RENDERING.md) | Поиск видео, shadow roots, выбор цели, отражение |
| [04_COMPATIBILITY_PERMISSIONS_SECURITY](docs/antimirror/04_COMPATIBILITY_PERMISSIONS_SECURITY.md) | Фреймы, разрешения, безопасность, приватность |
| [05_TEST_PLAN](docs/antimirror/05_TEST_PLAN.md) | Приёмка, браузерные тесты, производительность |
| [slices/README](docs/antimirror/slices/README.md) | Восемь слайсов S00–S07 |
| [06_RELEASE](docs/antimirror/06_RELEASE.md) | Проверка перед публикацией |
| [07_DECISIONS](docs/antimirror/07_DECISIONS.md) | Принятые решения и отклонённые варианты |
| [08_SOURCES](docs/antimirror/08_SOURCES.md) | Проверенные первичные источники |
| [09_PROGRESS](docs/antimirror/09_PROGRESS.md) | Текущее состояние реализации |
| [10_TECH_DEBT](docs/antimirror/10_TECH_DEBT.md) | Реестр конкретного техдолга |
| [11_HANDOFF](docs/antimirror/11_HANDOFF.md) | Передача контекста следующему запуску |
| [12_RISKS_AND_VALIDATION](docs/antimirror/12_RISKS_AND_VALIDATION.md) | Что нужно подтвердить экспериментально |
| [AI workflow](docs/antimirror/ai/WORKFLOW.md) | Правила работы по слайсам |
| [Тестовый стенд](testing/fixture-lab/README.md) | Локальные воспроизводимые страницы без внешнего видео |

## Важные решения

- Popup с одной кнопкой, а не одновременно `default_popup` и `action.onClicked`.
  Открытие popup ничего не включает. Хоткей переключает напрямую.
- Разрешения на HTTP/HTTPS нужны для широкого покрытия вложенных плееров; доступ браузера
  и фактическая активация отражения — разные вещи.
- В выключенном состоянии нет прикладного поиска, DOM-observers и периодического опроса.
  В документах фреймов остаётся маленький пассивный обработчик команд.
- Не переносим активацию на новый URL, новый video или новый медиаресурс. Переход между
  вкладками сам по себе не выключает ранее включённую вкладку.
- Не обещаем «абсолютно любое видео»: ограничения перечислены и должны быть видны пользователю.

## Что действительно проверено в пакете

См. [PACK_CHECKS](verification/PACK_CHECKS.md). Проверка файлов и тестового стенда **не равна**
проверке расширения. Результаты реализации ведутся отдельно в [progress](docs/antimirror/09_PROGRESS.md).
