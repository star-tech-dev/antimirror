# 13 — Telemetry, Growth & Privacy

## Status

**Purpose:** зафиксировать продуктовое видение аналитики и growth-инфраструктуры AntiMirror до начала её реализации.

**Scope:** документ не требует немедленной реализации. Он описывает, какие данные и зачем AntiMirror может собирать в будущих версиях, какие данные не должны собираться автоматически, как измерять полезность продукта и как поддержать продвижение через стримеров/сообщества.

**Приоритет:** реализовывать после стабильного core-функционала расширения и до заметной рекламной кампании / притока пользователей.

---

## 1. Зачем AntiMirror нужна телеметрия

Количество установок из Chrome Web Store / AMO само по себе почти ничего не говорит о качестве продукта.

Нам важно понимать:

- ставят ли расширение и реально ли им пользуются;
- как часто пользователь пытается включить зеркалирование;
- насколько часто AntiMirror успешно находит и зеркалит целевой `<video>`;
- на каких технических структурах чаще возникают проблемы: обычный DOM, open/closed Shadow DOM, iframe, nested iframe;
- сколько времени занимает discovery;
- насколько долго длится зеркальная сессия;
- почему режим зеркалирования выключается;
- какие ошибки и несовместимости требуют приоритетного исправления;
- какой рекламный источник приводит пользователей.

При этом AntiMirror не должен превращаться в расширение, которое отслеживает историю просмотров пользователя.

---

## 2. Базовый принцип

> **Мы анализируем работу AntiMirror, а не то, что смотрит пользователь.**

По умолчанию автоматическая телеметрия не должна отправлять:

- полный URL;
- hostname / domain посещаемой страницы;
- page title;
- название ролика / фильма / стрима;
- имя автора / стримера;
- текст или DOM-содержимое страницы;
- URL iframe;
- cookies;
- localStorage/sessionStorage сайта;
- media URL;
- историю посещений;
- скриншоты;
- содержимое кадров video/canvas;
- любые данные, позволяющие восстановить browsing history пользователя.

Даже если такие данные технически доступны extension-контексту, это не означает, что они должны использоваться для аналитики.

---

## 3. Privacy posture

AntiMirror должен иметь простую и легко объяснимую privacy-модель:

1. Расширение полностью работает без аналитики.
2. Телеметрия касается только работы самого расширения.
3. Автоматически не отправляется информация о том, какой конкретно сайт или видео смотрит пользователь.
4. Более подробная диагностика сайта отправляется только после явного действия пользователя.
5. Telemetry должна быть отключаемой.
6. В коде аналитики используется allowlist событий и полей, а не произвольная отправка объектов.
7. Никакого autocapture.
8. Никакого session replay.
9. Никакой сторонней аналитики непосредственно в content script страницы.
10. Перед публикацией каждой версии необходимо повторно проверить актуальные требования Chrome Web Store и Firefox AMO к disclosure/data collection.

Privacy — не только compliance-ограничение, но и часть позиционирования продукта:

> **AntiMirror не собирает историю просмотров.**

---

## 4. Архитектурный принцип

Бизнес-логика расширения не должна зависеть от конкретного аналитического провайдера.

Предлагаемый интерфейс:

```ts
export interface TelemetryPort {
  track<E extends TelemetryEvent>(
    event: E,
    properties: TelemetryProperties[E],
  ): void;

  flush?(): Promise<void>;
}
```

Пример:

```ts
telemetry.track('mirror_result', {
  result: 'success',
  discoveryType: 'closed_shadow',
  discoveryLatencyBucket: '100-300ms',
});
```

Допустимые реализации:

- `NoopTelemetryAdapter`;
- `PostHogTelemetryAdapter`;
- собственный backend adapter;
- другой provider в будущем.

### Требование

Никакая часть core-функционала не должна импортировать SDK PostHog или другого поставщика напрямую.

---

## 5. Базовые события

### 5.1 Lifecycle

#### `extension_installed`

Поля:

- extension version;
- browser family;
- browser major version;
- OS family.

Не отправлять machine fingerprint и детальные hardware-параметры.

#### `extension_updated`

Поля:

- previous version;
- current version;
- browser family.

### 5.2 Mirror intent

#### `mirror_requested`

```ts
{
  action: 'enable' | 'disable';
  source: 'popup' | 'hotkey';
}
```

### 5.3 Discovery

#### `video_discovery_result`

```ts
{
  result:
    | 'found'
    | 'not_found'
    | 'ambiguous'
    | 'timeout'
    | 'unsupported'
    | 'error';

  discoveryType?:
    | 'regular_dom'
    | 'open_shadow'
    | 'closed_shadow'
    | 'iframe'
    | 'nested_iframe';

  latencyBucket?:
    | '<50ms'
    | '50-100ms'
    | '100-300ms'
    | '300-1000ms'
    | '>1000ms';

  candidateCountBucket?: '0' | '1' | '2-3' | '4-10' | '10+';
}
```

### 5.4 Mirror result

#### `mirror_result`

```ts
{
  result:
    | 'success'
    | 'no_video'
    | 'ambiguous'
    | 'unsupported'
    | 'timeout'
    | 'style_conflict'
    | 'frame_unreachable'
    | 'error';

  discoveryType?: DiscoveryType;
}
```

### 5.5 Session

#### `mirror_session_finished`

```ts
{
  durationBucket:
    | '<1m'
    | '1-10m'
    | '10-30m'
    | '30-60m'
    | '1-3h'
    | '3h+';

  endReason:
    | 'user'
    | 'navigation'
    | 'video_removed'
    | 'source_changed'
    | 'target_lost'
    | 'extension_update'
    | 'error'
    | 'unknown';

  discoveryType?: DiscoveryType;
}
```

Не отправлять точный timestamp начала просмотра конкретного сайта, если в нём нет необходимости.

### 5.6 Performance

#### `discovery_performance`

Использовать агрегированные / bucketed параметры:

```ts
{
  scannedNodesBucket: '<100' | '100-500' | '500-2000' | '2000+';
  latencyBucket: '<50ms' | '50-100ms' | '100-300ms' | '300-1000ms' | '>1000ms';
  shadowRootCountBucket: '0' | '1-3' | '4-10' | '10+';
  frameCountBucket: '0' | '1-3' | '4-10' | '10+';
}
```

Цель — обнаруживать performance-regression, а не описывать структуру конкретной страницы.

### 5.7 Errors

#### `extension_error`

```ts
{
  code: AntiMirrorErrorCode;
  subsystem:
    | 'background'
    | 'content'
    | 'discovery'
    | 'renderer'
    | 'messaging'
    | 'storage'
    | 'popup';
  extensionVersion: string;
}
```

Использовать собственные стабильные error codes.

Не отправлять DOM snippets, URL, title и произвольный context со страницы. Если отправляется stack trace нашего кода, перед отправкой он должен быть очищен от потенциально чувствительных данных.

---

## 6. Ключевые продуктовые метрики

### 6.1 Activation

```text
Activated Users / Installs
```

Активированным можно считать пользователя, который хотя бы один раз вызвал `mirror_requested(enable)`.

### 6.2 Mirror Success Rate

```text
successful mirror attempts / all mirror enable attempts
```

Одна из главных quality-метрик AntiMirror.

### 6.3 Discovery Success Rate

```text
video found / discovery attempts
```

Дополнительно разбивать по regular DOM / open shadow / closed shadow / iframe / nested iframe.

### 6.4 WAU

Weekly Active User: пользователь, у которого за неделю произошёл хотя бы один осмысленный AntiMirror action.

Не следует оптимизировать продукт исключительно под DAU: AntiMirror — utility, которая может быть очень полезной даже при использовании один раз в неделю.

### 6.5 Weekly Mirror Sessions

Количество успешно начатых mirror sessions за неделю.

### 6.6 Weekly Mirrored Hours

Предпочтительная value-метрика. Считать приблизительно по duration buckets.

Пример публичной продуктовой статистики в будущем:

```text
12 400 active users
31 800 mirror sessions / week
46 000 mirrored hours / week
97.8% mirror success rate
```

Эта метрика показывает реальную полезность продукта без необходимости знать, что именно пользователь смотрел.

### 6.7 Reliability by discovery type

```text
Regular DOM       99.8%
Open Shadow DOM   99.5%
Closed Shadow     98.1%
Iframe            96.2%
Nested iframe     92.8%
```

---

## 7. Failure taxonomy

Нужно заранее поддерживать стабильную taxonomy ошибок.

Черновой набор:

```text
VIDEO_NOT_FOUND
VIDEO_AMBIGUOUS
DISCOVERY_TIMEOUT
FRAME_UNREACHABLE
FRAME_PERMISSION_DENIED
TARGET_REMOVED
TARGET_CHANGED
SOURCE_CHANGED
STYLE_CONFLICT
RENDER_FAILED
STALE_COMMAND
BACKGROUND_UNAVAILABLE
UNSUPPORTED_CONTEXT
UNKNOWN_ERROR
```

Ошибка должна быть технической категорией, а не arbitrary message.

---

## 8. Explicit site report

Hostname конкретного сайта может быть очень полезным для отладки, но он не должен попадать в стандартную automatic telemetry.

После неудачного mirror attempt можно показать:

```text
Не удалось отзеркалить видео

[ Отправить отчёт ]
```

Либо дать постоянное действие:

```text
Report a problem on this site
```

### Перед отправкой

Пользователь должен видеть краткое описание данных.

Пример:

```text
Будет отправлено:

Сайт: vkvideo.ru
AntiMirror: 1.2.1
Browser: Chrome 152

Result: VIDEO_NOT_FOUND
Video candidates: 0
Frames: 4
Shadow roots: 7
Closed shadow roots: 2

Не отправляются:
— полный адрес страницы;
— название видео;
— содержимое страницы;
— cookies;
— история просмотров.
```

Только после подтверждения отправляется report.

---

## 9. Что может содержать site report

```ts
interface SiteProblemReport {
  hostname: string;
  extensionVersion: string;
  browserFamily: string;
  browserMajor: number;
  errorCode: AntiMirrorErrorCode;

  diagnostics: {
    videoCandidateCountBucket: string;
    frameCountBucket: string;
    shadowRootCountBucket: string;
    closedShadowRootCountBucket: string;
    discoveryType?: DiscoveryType;
    discoveryLatencyBucket?: string;
  };
}
```

По возможности hostname хранить отдельно от глобальной anonymous usage telemetry.

---

## 10. Site compatibility knowledge base

Explicit reports в будущем позволяют построить внутреннюю compatibility database.

```text
vkvideo.ru

Reports:             41
Latest version:      1.4.2
Main issue:          FRAME_UNREACHABLE
Last regression:     2026-10-17
Status:              investigating
```

В дальнейшем это может стать user-facing функцией вроде `VK Video — compatibility confirmed`, но это отдельная продуктовая задача.

---

## 11. Acquisition attribution

Продвижение через стримеров / модераторов / сообщества должно измеряться преимущественно **вне расширения**.

### Campaign links

Предлагаемый формат:

```text
https://antimirror.star-tech.dev/x/<campaign>
```

Примеры:

```text
/x/streamer-name
/x/streamer-name-twitch
/x/community-name
/x/vk-group-name
```

Campaign slug не должен содержать персональные данные пользователя.

---

## 12. Landing analytics

На landing page можно измерять:

- visits;
- unique visitors;
- store CTA clicks;
- Chrome CTA clicks;
- Firefox CTA clicks;
- conversion landing → store.

Пример:

```text
Streamer A

Landing visits     8 420
Chrome clicks      4 910
Firefox clicks       960
Total store clicks 5 870
```

Это полезнее и чище, чем встраивать рекламный attribution непосредственно в extension runtime.

---

## 13. Install attribution — возможное развитие

Если позже потребуется приблизительно связывать campaign со свежеустановленным AntiMirror:

1. пользователь приходит на campaign landing;
2. landing сохраняет campaign id first-party способом;
3. после установки AntiMirror может открыть onboarding / welcome page;
4. welcome page может связать install onboarding visit с существующей campaign.

Нельзя использовать для этого browsing history. Механизм проектировать отдельно с учётом privacy и store policies на момент реализации.

---

## 14. Dashboard vision

```text
ANTI MIRROR

ACQUISITION
────────────────────
New installs             1 284
Landing → store CTR       68.2%

USAGE
────────────────────
WAU                       1 908
Mirror attempts           9 421
Successful                9 087
Success rate              96.5%
Mirror sessions           8 731
Mirrored hours           14 281

DISCOVERY
────────────────────
Regular DOM               99.8%
Open Shadow               99.3%
Closed Shadow             97.8%
Iframe                    95.6%
Nested iframe             91.4%

FAILURES
────────────────────
VIDEO_NOT_FOUND             112
FRAME_UNREACHABLE            76
TARGET_CHANGED               43
STYLE_CONFLICT               27

PERFORMANCE
────────────────────
Median discovery          <100 ms
Slow discovery (>1s)        1.8%

CAMPAIGNS
────────────────────
streamer-a             531 store clicks
streamer-b             241 store clicks
community-c            188 store clicks
```

---

## 15. Provider

На первом этапе допустимо использовать PostHog или аналогичный продукт, но только через собственный adapter.

### Разрешено

- explicit events;
- typed properties;
- funnels;
- aggregate dashboards;
- cohorts;
- feature flags при необходимости.

### Не использовать

- autocapture;
- web session replay;
- DOM capture;
- arbitrary page metadata;
- automatic URL collection;
- recording пользовательской активности на странице.

Если SDK по умолчанию отправляет дополнительные свойства, их необходимо явно отключить или отказаться от SDK в пользу собственного HTTP-клиента.

---

## 16. Anonymous identity

Account-based tracking не нужен.

Если для WAU/retention необходим стабильный anonymous installation id:

- генерировать случайный UUID внутри extension storage;
- не строить fingerprint;
- не использовать device identifiers;
- не пытаться связывать пользователя между устройствами;
- при uninstall id исчезает вместе с extension state;
- предусмотреть reset при отключении analytics, если это потребуется privacy-моделью.

Пример:

```ts
crypto.randomUUID();
```

---

## 17. Analytics opt-out

В будущей версии settings:

```text
Privacy

[✓] Send anonymous usage and technical analytics

Helps improve video detection and extension reliability.
Visited websites and video titles are not included.
```

Default-mode определить отдельно перед реализацией с учётом store policies на тот момент.

---

## 18. Не смешивать analytics и core state

Core должен:

- работать offline;
- работать при недоступном analytics backend;
- работать при отключённой telemetry;
- не ждать network request при включении mirror.

Telemetry всегда best-effort.

---

## 19. Network behaviour

Требования:

- не делать network request на каждое DOM-событие;
- buffering/batching;
- ограниченный объём payload;
- timeout;
- failure silently ignored;
- отсутствие retry storm;
- никакого влияния analytics network failure на mirror operation;
- разумный flush при lifecycle возможности, без гарантии доставки каждого события.

Analytics — статистика, а не transactional system.

---

## 20. Data minimization

Перед добавлением каждого нового property задавать вопросы:

1. Какое конкретное продуктовое решение мы примем благодаря этому полю?
2. Можно ли получить тот же сигнал менее чувствительным способом?
3. Нужна ли точная величина или достаточно bucket?
4. Требуется ли identifier?
5. Можно ли не отправлять hostname?
6. Что произойдёт, если это поле никогда не собирать?

Если нет чёткого ответа на пункт 1 — поле не добавляется.

---

## 21. Retention

Retention-периоды определить перед production launch telemetry.

Предпочтение:

- raw events — ограниченный срок;
- агрегаты — дольше;
- explicit site reports — хранить столько, сколько необходимо для compatibility/debugging;
- не хранить лишние данные «на всякий случай».

Удаление старых raw events должно быть автоматизировано на стороне backend/provider.

---

## 22. Возможные future features

После появления реальной аудитории можно рассмотреть:

### Compatibility health

Показывать пользователю известный статус поддержки сайта.

### Failure feedback

```text
This site is currently known to have issues with AntiMirror.
Fix in progress.
```

### Remote compatibility config

В исключительных случаях можно доставлять безопасные configuration hints без выпуска новой версии extension:

- feature flags;
- отключение проблемного optimization path;
- compatibility fallback.

Не превращать это в remote code execution.

### Public stats

На landing:

```text
46K+ mirrored hours this week
97.8% successful mirror rate
```

### Growth experiments

- onboarding copy;
- popup UX;
- hotkey education;
- report flow;
- donation CTA;
- STAR-tech cross-promotion.

---

## 23. Anti-goals

Не использовать AntiMirror для:

- сбора истории просмотров;
- построения рекламного профиля пользователя;
- продажи пользовательских данных;
- cross-site behavioral tracking;
- fingerprinting;
- мониторинга сайтов вне взаимодействия с AntiMirror;
- session replay;
- скрытой отправки hostname;
- извлечения контента video для аналитики.

---

## 24. Рекомендуемая поэтапная реализация

### Phase A — Instrumentation architecture

Реализовать:

- `TelemetryPort`;
- `NoopTelemetryAdapter`;
- typed event schema;
- event/property allowlist;
- telemetry settings contract;
- тесты на запрет неизвестных properties.

Без production backend.

### Phase B — Anonymous core telemetry

Подключить:

- install/update;
- mirror requested;
- discovery result;
- mirror result;
- session finished;
- performance buckets;
- error codes.

Построить базовый dashboard.

### Phase C — Acquisition

Перед первой заметной рекламой:

- campaign landing URLs;
- landing analytics;
- store CTA tracking;
- campaign dashboard.

### Phase D — Explicit site reports

Добавить:

- failure UI;
- consent/preview;
- hostname report;
- diagnostics payload;
- compatibility dashboard.

### Phase E — Product intelligence

После накопления реального usage:

- compatibility score;
- regression alerts;
- release comparison;
- acquisition quality;
- optional feature flags;
- public aggregate metrics.

---

## 25. Минимум перед рекламой у стримеров

Если нужно сделать только самое необходимое до первого заметного продвижения:

### Extension

- anonymous installation id;
- `mirror_requested`;
- `video_discovery_result`;
- `mirror_result`;
- `mirror_session_finished`;
- `extension_error`;
- analytics opt-out;
- privacy disclosure.

### Website

- `/x/<campaign>`;
- landing visit;
- store CTA click;
- campaign id;
- базовый acquisition dashboard.

### Желательно

- `Report a problem on this site`.

---

## 26. Definition of Done для первой telemetry-итерации

Итерацию можно считать готовой, если:

- core AntiMirror работает при полностью отключённой analytics;
- нет автоматической отправки URL/hostname/title/media metadata;
- schema событий типизирована;
- unknown properties невозможно незаметно добавить;
- analytics network failure никак не ломает mirror;
- пользователь может отключить telemetry;
- privacy text соответствует фактическому поведению кода;
- есть dashboard success/failure/WAU/sessions;
- campaign links позволяют сравнивать источники трафика;
- Chrome/Firefox store disclosure перепроверены непосредственно перед release.

---

## 27. Decision summary

На текущем этапе принято следующее направление:

1. **Телеметрию AntiMirror стоит заложить до масштабного продвижения.**
2. Главная цель — измерять reliability и реальную полезность расширения.
3. **Browsing history не является источником продуктовой аналитики.**
4. Стандартная telemetry не содержит hostname.
5. Информация о конкретном сайте возможна через отдельный explicit report.
6. Продвижение через стримеров измеряется campaign landing links.
7. Одна из главных value-метрик — **Weekly Mirrored Hours**.
8. Analytics provider инкапсулируется за `TelemetryPort`.
9. Autocapture/session replay запрещены архитектурно.
10. Первую реализацию telemetry выполнять после стабилизации core и до заметной рекламной кампании.

---

## 28. Open questions before implementation

Перед первым telemetry slice отдельно решить:

- какой provider использовать;
- нужен ли собственный backend proxy;
- default telemetry on/off с учётом актуальных store requirements;
- retention raw events;
- exact anonymous-id lifecycle;
- нужен ли Sentry отдельно или достаточно собственной error telemetry;
- где размещается privacy policy STAR-tech;
- какой домен будет основным: `antimirror.star-tech.dev` или другой вариант;
- нужен ли общий analytics backend для нескольких STAR-tech расширений;
- хотим ли мы связывать AntiMirror с будущей общей STAR-tech donation/growth infrastructure.

Эти решения не блокируют текущую реализацию core AntiMirror.
