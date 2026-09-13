# S08 · Release polish 1.0

## Цель

Подготовить AntiMirror 1.0.0 к заполнению Chrome Web Store и Firefox AMO без изменения ручного,
per-tab и single-video runtime-контракта.

## Scope

- стабильный Firefox ID `antimirror@star-tech.dev` и homepage/support `https://star-tech.dev/`;
- версия 1.0.0 во всех manifests и архивах;
- явный EN/RU selector в popup с локально сохранённым preference;
- новый store icon и различимые OFF/ON toolbar icons;
- локализованные title/summary/description, permission justifications и privacy declarations;
- 128×128 icon, 440×280 promo, 1400×560 marquee и EN/RU 1280×800 screenshots;
- короткая privacy notice для локальной обработки без передачи данных.

## Инварианты

- смена языка не отправляет `SET_ENABLED` и не запускает discovery;
- только основная кнопка и browser command остаются trusted activation actions;
- preference языка не содержит URL, page content или media identity;
- store copy не обещает неподтверждённую совместимость и не использует keyword spam;
- Firefox `data_collection_permissions.required = ["none"]` остаётся точным: данные не
  собираются и не передаются за пределы расширения.

## Gate

1. Unit: locale normalization и placeholder rendering.
2. Chromium production E2E: EN→RU, persistence после reopen, RU→EN, состояние остаётся OFF.
3. Firefox native UX regression с новым add-on ID.
4. Lint, typecheck, обе MV3 builds и manifest audit.
5. Визуальная проверка 16/128 icons и всех store asset dimensions.
6. Два package builds дают одинаковые SHA256; evidence и handoff обновлены.
