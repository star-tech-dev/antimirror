# S09 · PiP state retention

## Цель

Не сбрасывать явно включённое состояние при автоматическом или ручном входе браузера в PiP,
если выбранный `video` остаётся в DOM и его media identity и owned mirror-effect не изменились.

## Контракт

- `enterpictureinpicture`, `leavepictureinpicture` и обычная смена видимости документа сами по
  себе не отправляют `TARGET_LOST` и не переводят вкладку в OFF.
- Существующие причины потери цели остаются действующими: удаление/replacement video, смена
  media identity, ended/error, navigation и потеря owned effect.
- Отражение отдельного нативного окна PiP не гарантируется. После выхода тот же DOM-video
  остаётся зеркальным без повторного включения пользователем.
- Legacy `PIP_UNSUPPORTED` можно прочитать из старой session-записи как OFF reason, но новые
  content messages с этой причиной не принимаются протоколом.

## Definition of Done

- Production Chromium E2E проходит последовательность enter PiP → visibility change → leave
  PiP и подтверждает `phase=on` и ровно один mirror-effect.
- Ручной OFF после последовательности полностью очищает effect.
- Unit protocol guard отвергает устаревший `PIP_UNSUPPORTED` в новом `TARGET_LOST`.
- Typecheck, lint, unit, обе MV3 builds/manifests и release archive audit проходят.
