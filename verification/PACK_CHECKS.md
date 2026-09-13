# Проверка документационного пакета

> Архивный отчёт исходного документационного пакета от 2026-09-11. Он сохранён как история и
> не описывает текущую реализацию или RC. Актуальный gate: [RELEASE_CHECKLIST](RELEASE_CHECKLIST.md).

Дата: **2026-09-11**. Это проверка файлов, локального стенда и отдельных DOM-механизмов.
**Это не приёмка расширения, не завершение S00 и не доказательство работы VK.**

## Выполнено

| Проверка | Результат | Граница доказательства |
|---|---|---|
| Синтаксис server.mjs и app.js: `node --check` | PASS | Node.js v22.16.0; не browser extension build |
| HTTP /health на двух loopback-портах | PASS | Оба сервера действительно запущены |
| Выдача HTML, JS, CSS и /child | PASS | Корректные ответы и Content-Type |
| Заголовок strict-csp | PASS | Проверен ответ сервера, не браузерное исполнение политики |
| Неизвестные пути и traversal-like пути | PASS | 404, произвольные файлы не выдаются |
| 17 изолированных DOM-сценариев | PASS | Chromium 144.0.7559.96, headless; подробности ниже |
| Один постоянный additive WAAPI effect | PASS | Простой page-context пример, не extension/CSS compatibility matrix |
| Отмена этого effect | PASS | Исходный computed transform восстановился; inline не перезаписан |
| Состав пакета и локальные Markdown-ссылки | PASS | Файлы и явно заданные source anchors существуют |
| Формат двух repository skills | PASS | Есть frontmatter name/description и инструкции |
| Слайсы S00–S07 и T01–T70 | PASS | Полный набор документов/ID; не результат выполнения этих тестов |
| ZIP и контрольные суммы | PASS | Проверены при финальной сборке пакета |

## Как выполнялся DOM smoke

Прямой переход установленного Chromium на localhost завершился
`ERR_BLOCKED_BY_ADMINISTRATOR`. Политики среды не менялись. Поэтому отдельные HTML/JS/CSS
стенда были загружены через Playwright в `about:blank`; выбранный case задавался тестовым
harness. Это позволяет проверить построение DOM, synthetic video и простую WAAPI-семантику,
**но не равнозначно загрузке реальной HTTP-страницы**.

Проверены: basic, open, closed, nested, late-shadow, slot, multiple, secondary, no-video,
canvas-only, frame-srcdoc, frame-blank, transforms, site-animation, important, origin-corner,
mutations. Для related-frame вариантов проверена готовность синтетического video. Для closed
root проверено, что обычный host.shadowRoot возвращает null; privileged extension getter
здесь **не проверялся**. Mutation storm включён/выключен, синхронный reparent выполнен.
Проверка `important` означает, что fixture строится, а не что расширение преодолело cascade.

Простой WAAPI probe:

```text
before: matrix(0.9, 0, 0, 0.9, 12, 0)
on:     matrix(-0.9, 0, 0, 0.9, 12, 0)
after:  matrix(0.9, 0, 0, 0.9, 12, 0)
playState: paused
inlinePreserved: true
```

Краткий машинный отчёт: [fixture_smoke_results.json](fixture_smoke_results.json).
Этот отчёт относится только к проверенной среде и не заменяет S00 feasibility gates.

## NOT_RUN / остаётся на разработку

WXT-сборка и настоящий extension context; privileged open/closed access; реальная
cross-origin координация; host permissions/revocation; CSP в браузере; toolbar/hotkeys;
worker suspend/recovery; Firefox/Edge/Brave; настоящие плееры VK, live и остальные сайты;
все performance budgets/метрики; release package и store review.

Все восемь слайсов реализации остаются **TODO**. У пакета нет production-кода расширения.
