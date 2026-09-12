# 11. Передача контекста

## Где остановились · 2026-09-12

S00 DONE. Начальная база: `5d2f6fd` (docs), изменения S00 оставлены в рабочем дереве,
без commit/push/publication. Полные факты — [evidence](evidence/S00-2026-09-12.md).
Каркас WXT готов, но обычная сборка всегда OFF: кнопка пока disabled, пользовательской
активации нет. Не считать test-only SPIKE_APPLY реализацией доверенного toggle.

## Следующее точное действие

Прочитать `slices/S01_VERTICAL_SLICE.md` и нужные разделы `02_STATE_AND_PROTOCOL.md`.
Реализовать один top-frame video: кнопка popup → background controller → адресный APPLY/ACK
с document/operation/target IDs → подтверждённый ON → обратимый OFF.
Перед использованием `createMirrorEffect` добавить проверку фактического результата/conflict
и ownership по требованиям S01; S00 primitive сам их не обеспечивает.
Не начинать deep scanner/frame coordinator раньше соответствующих слайсов.

## Проверенная основа

Node 24.13.0, pnpm 10.29.2, WXT 0.21.4, TypeScript 5.9.3. Установка из lockfile,
typecheck, lint, unit (3), Chrome/Firefox MV3 builds и manifest verification прошли.
Chrome for Testing 153.0.8010.12 + Firefox 150.0.1 / 155.0.1: closed native accessor,
about:blank/srcdoc, additive scaleX с исходным transform/3D ancestor, cleanup — PASS.
Raw-CDP Chromium: естественный idle 40 s, смена boot ID, session и effect сохранены — PASS.
Firefox event-page idle/full controller recovery пока NOT_RUN, это проверка S04.

## Команды

`pnpm install --frozen-lockfile`; `pnpm typecheck`; `pnpm lint`; `pnpm test:unit`;
`pnpm build:chrome`; `pnpm build:firefox`; `pnpm verify:manifests`.
`pnpm test:e2e:chromium` поднимает собственный стенд; при конфликте портов задать
FIXTURE_PORT и FIXTURE_FRAME_PORT. `.browser-cache` нужен для Playwright browser.
Для `pnpm test:e2e:firefox` и `pnpm test:worker-idle` отдельно запустить `pnpm fixtures`.
Firefox binary переопределяется FIREFOX_BINARY; используются временные профили.

## Не потерять

`.output-spike` / `testing/extension` — только диагностическая сборка, её нельзя распространять.
Обычные JS/HTML проверяются на отсутствие тестовых endpoints. Fixture рисует собственную
асимметричную картинку; production код не читает кадры или page globals.
Playwright worker debugger удерживает idle: естественный сон проверять raw-CDP скриптом,
который подключается только к probe page и выбирает точный ID нашего addon.
Скриншоты находятся в gitignored test-results; не публиковать пользовательские страницы.

## Непроверенное

VK и прочие реальные сайты, fullscreen/native controls/PiP, Edge/Brave, Firefox event-page
suspend и последующий production controller recovery. Минимум Firefox в manifest — 140,
но фактически тестировались 150.0.1 и 155.0.1. Полный жизненный цикл относится к S01–S04.
