# 08. Первичные источники и границы утверждений

Проверка документации выполнена **11 сентября 2026 года**. Ни один источник не является
доказательством работоспособности нашего ещё не реализованного расширения на конкретном сайте.
Версии инструментов, browser minimums и правила магазинов перепроверять при S00/релизе.

Документы пакета — оригинальные проектные решения; ссылки ниже обосновывают отдельные
браузерные факты. Числовые бюджеты, ranking, eight-slice plan и политика reset — решения
этого проекта, а не требования стандартов. Пересказанные ограничения не заменяют эксперименты.

<a id="s01"></a>
## S01. WXT — Entrypoints

[Первоисточник](https://wxt.dev/guide/essentials/entrypoints.html).

defineBackground/defineContentScript, entrypoint main и mapping options. Не исполнять DOM-код при build-time import.

<a id="s02"></a>
## S02. WXT — Targeting Different Browsers

[Первоисточник](https://wxt.dev/guide/essentials/target-different-browsers).

Явные --mv3 builds. Не полагаться на browser default manifest version.

<a id="s03"></a>
## S03. Chrome — Content scripts

[Первоисточник](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts).

Isolated world; frame injection и related-frame matching не равнозначны неограниченному доступу.

<a id="s04"></a>
## S04. MDN — content_scripts manifest

[Первоисточник](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/content_scripts).

all_frames, match_about_blank, match_origin_as_fallback; особенности инъекции в пустые Firefox iframe.

<a id="s05"></a>
## S05. Chrome — action API

[Первоисточник](https://developer.chrome.com/docs/extensions/reference/api/action).

Popup подавляет onClicked; tabId применяется для отдельных состояний action.

<a id="s06"></a>
## S06. Chrome — Service worker lifecycle

[Первоисточник](https://developer.chrome.com/docs/extensions/develop/concepts/service-workers/lifecycle).

Worker может завершаться; глобальные переменные нельзя считать постоянным state storage.

<a id="s07"></a>
## S07. Chrome — storage API

[Первоисточник](https://developer.chrome.com/docs/extensions/reference/api/storage).

Session area хранит данные в памяти, не является persistent preference между перезапусками браузера.

<a id="s08"></a>
## S08. MDN — storage.session

[Первоисточник](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/storage/session).

WebExtensions session storage и необходимость проверить поддержку выбранного Firefox target.

<a id="s09"></a>
## S09. MDN — background manifest

[Первоисточник](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/manifest.json/background).

Разные background environments в Chromium и Firefox MV3.

<a id="s10"></a>
## S10. Chrome — webNavigation API

[Первоисточник](https://developer.chrome.com/docs/extensions/reference/api/webNavigation).

Committed navigation, history/fragment events, frame/document identity и BFCache нюансы.

<a id="s11"></a>
## S11. Chrome — dom API

[Первоисточник](https://developer.chrome.com/docs/extensions/reference/api/dom).

openOrClosedShadowRoot для author roots; это реальная extension-возможность, а не DOM-хак.

<a id="s12"></a>
## S12. MDN — dom.openOrClosedShadowRoot

[Первоисточник](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/dom/openOrClosedShadowRoot).

Firefox эквивалент через element.openOrClosedShadowRoot; адаптеры браузеров различаются.

<a id="s13"></a>
## S13. W3C — Intersection Observer

[Первоисточник](https://www.w3.org/TR/intersection-observer/).

Пересечения через вложенные browsing contexts; rootBounds может быть null у cross-origin target.

<a id="s14"></a>
## S14. W3C — CSS Transforms Level 2

[Первоисточник](https://www.w3.org/TR/css-transforms-2/).

Порядок композиции трансформаций и различие 2D/3D. Individual transforms не являются произвольной заменой композиции transform-list.

<a id="s15"></a>
## S15. MDN — backface-visibility

[Первоисточник](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/backface-visibility).

3D-разворот может скрыть обратную сторону элемента; scaleX и rotateY не объявляются эквивалентными во всех 3D-сценах.

<a id="s16"></a>
## S16. MDN — KeyframeEffect.composite

[Первоисточник](https://developer.mozilla.org/en-US/docs/Web/API/KeyframeEffect/composite).

Аддитивная композиция эффекта отличается от replace.

<a id="s17"></a>
## S17. W3C — Web Animations

[Первоисточник](https://www.w3.org/TR/web-animations-1/).

Семантика timeline/currentTime, композиции, fill и lifecycle эффектов. Долгоживущий owned effect требует явного cleanup.

<a id="s18"></a>
## S18. YouTube Help — Fair use

[Первоисточник](https://support.google.com/youtube/answer/9783148?hl=en).

Наличие прав/исключений определяется не простым изменением картинки и не исходом автоматического детектирования. Правила различаются по юрисдикциям.

<a id="s19"></a>
## S19. Chrome — activeTab

[Первоисточник](https://developer.chrome.com/docs/extensions/develop/concepts/activeTab).

Временное разрешение по действию пользователя; не считать его blanket-разрешением на все чужие origins.

<a id="s20"></a>
## S20. WXT — Content Scripts

[Первоисточник](https://wxt.dev/guide/essentials/content-scripts.html).

ContentScriptContext и invalidation helpers; framework hooks не отменяют browser lifecycle ограничения.

<a id="s21"></a>
## S21. Chrome Web Store — Use of Permissions

[Первоисточник](https://developer.chrome.com/docs/webstore/program-policies/permissions).

Запрашивать минимальные необходимые права, не доступ для будущих функций.

<a id="s22"></a>
## S22. Playwright — Chrome extensions

[Первоисточник](https://playwright.dev/docs/chrome-extensions).

Extension E2E: Chromium persistent context; учитывать ограничения sideload и текущие инструменты.

<a id="s23"></a>
## S23. OpenAI — AGENTS.md

[Первоисточник](https://learn.chatgpt.com/docs/agent-configuration/agents-md).

Официальная документация project instructions; краткий AGENTS и ссылки вместо огромного непрерывного контекста.

<a id="s24"></a>
## S24. OpenAI — Build skills

[Первоисточник](https://learn.chatgpt.com/docs/build-skills).

Repository skills в .agents/skills, SKILL.md с name/description; инструкции загружаются по задаче.

<a id="s25"></a>
## S25. Chrome — commands API

[Первоисточник](https://developer.chrome.com/docs/extensions/reference/api/commands).

Manifest commands и пользовательские shortcuts. Нельзя гарантировать отсутствие конфликтов сочетаний.

<a id="s26"></a>
## S26. MDN — Picture-in-Picture API

[Первоисточник](https://developer.mozilla.org/en-US/docs/Web/API/Picture-in-Picture_API).

PiP — отдельная браузерная поверхность; наличие :picture-in-picture не доказывает перенос CSS-transform в окно.

## Что не исследовалось как доказанный факт

Не выполнен сравнительный аудит всех магазинных конкурентов и не измерена их текущая работа
на VK. Исходный pain point взят из задачи пользователя. Не проверены экономика/ASO, права на
конкретные трансляции, доступность store names и юридическая чистота сторонних публикаций.
Эти вопросы не нужны для разработки локального ручного visual utility.
