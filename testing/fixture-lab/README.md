# Fixture Lab — локальные страницы для проверки расширения

Это **работающий тестовый стенд**, не реализация расширения и не готовая система E2E.
Он создаёт синтетические асимметричные кадры в `canvas`, передаёт их через `captureStream()`
в настоящий `HTMLVideoElement`. В сценарии `canvas-only` video специально отсутствует.
Стенд не загружает фильмы и не обращается к внешним сервисам.

## Запуск

Из корня репозитория, Node.js ≥22:

```sh
node testing/fixture-lab/server.mjs
# Открыть http://127.0.0.1:4173/?case=basic
```

Два разных порта — два origin. Сервер слушает **только 127.0.0.1**.
При конфликте портов не останавливать чужие процессы:

```sh
FIXTURE_PORT=4273 FIXTURE_FRAME_PORT=4274 node testing/fixture-lab/server.mjs
```

`/health` на обоих портах возвращает JSON. Сервер не требует npm install.
Остановка — Ctrl+C. Расширению нужны разрешения на эти локальные HTTP origins.
`localhost`, `127.0.0.1` и произвольный LAN IP не считать одной и той же конфигурацией.

## Сценарии

| case | Что воспроизводит |
|---|---|
| basic | Top-level video, media events, удаление/замена/перенос узла |
| open / closed / nested | Open, closed и вложенные shadow roots |
| late-shadow | Attach closed root к уже существовавшему div по кнопке/таймеру |
| slot | Light-DOM video, отображаемый через slot |
| multiple / secondary | Неоднозначность двух крупных video / основной и маленький |
| no-video / canvas-only | Нет поддерживаемой цели |
| frame-same / frame-cross | Same-origin / cross-origin iframe |
| frame-nested | Два уровня frame, нижний video внутри closed root |
| shadow-frame | Iframe внутри closed root |
| frame-hidden | Hidden большой iframe не должен выиграть у видимого top video |
| frame-srcdoc / frame-blank | Родственные about:srcdoc / about:blank документы |
| transforms | Сайт уже задаёт translate/rotate/scale/backface-visibility и 3D ancestor |
| site-animation | Сайт анимирует transform |
| important / origin-corner | Конфликт cascade / нестандартный transform-origin |
| strict-csp | Страница с CSP без разрешения inline script/style |
| mutations | Управляемый поток посторонних DOM mutations |

Общие кнопки позволяют сменить URL, оставить тот же URL через replaceState, изменить hash,
заменить `srcObject`, поменять картинку внутри того же stream, удалить target/посторонний iframe.
Кнопки действуют только на объекты своего документа; для вложенной страницы использовать
её контекст DevTools/Playwright. Отсутствующая цель делает соответствующую кнопку no-op.

`window.__antiMirrorFixture` — **только тестовый интерфейс страницы**. Playwright может
использовать его для сценариев, но код расширения не должен читать его или считать источником
истины. В частности, тест должен получать closed root из extension API, а не из page global.

## Базовая ручная процедура

1. Загрузить unpacked/test build расширения; открыть нужный case.
2. Проверить OFF → ON → OFF; при ON надписи внутри video читаются зеркально.
3. Сопоставить состояние иконки и popup с реально применённым эффектом.
4. Повторить действие lifecycle-кнопкой, сравнить с таблицей сбросов в ТЗ.
5. Повторить в настоящем Firefox, а не в Chromium с подменённым user-agent.

Для `late-shadow` нажать «через 1 секунду», затем сразу активировать расширение. После
успешного поиска новый root не должен вызывать дополнительный глобальный обход.
Для `transforms` и `site-animation` убедиться, что стиль/движение сайта сохраняются после OFF.

## Ограничения стенда

Это 23 страницы-сценария плюс интерактивные изменения, **не все 70 тест-кейсов ТЗ**.
Autoplay может требовать кнопку воспроизведения. Fullscreen требует user gesture.
Кадры рисуются 8 раз/s и сами потребляют CPU; учитывать baseline без расширения.
При pagehide генерация останавливается; полная BFCache/media-проверка требует отдельного
fixture/adaptation в S04. Стенд не эмулирует Chrome service-worker suspend, host revocation,
HLS/DASH/MSE, DRM, PiP-поведение, sandbox без same-origin и реальные VK/Twitch плееры.
`srcdoc/about:blank` варианты сами пишут свой документ: это не разрешённая стратегия расширения.

Результаты подготовки стенда перечислены в `verification/PACK_CHECKS.md`. Наличие страницы
не означает, что соответствующая функциональность расширения уже реализована или проверена.
