# 12. Риски и обязательные проверки

Здесь нет утверждения, что эксперимент уже пройден. **Gate** — наблюдаемый результат,
не размышление о том, как должно работать API.

| Риск | Проверка | Когда | Решение при неуспехе |
|---|---|---|---|
| Privileged closed-root getter отличается по браузерам | video внутри реально closed root, вызов из extension content context | S00 | Исправить adapter; не имитировать root через page global |
| WXT Firefox build оказывается MV2 | Inspect actual manifest, load Firefox extension | S00 | Явный --mv3, поправить target config |
| Additive effect не применяется/ломает transform | Asymmetric video + baseline transforms + cleanup в Chrome/Firefox | S00 | Один доказанный альтернативный engine через ADR; не clobber |
| Shadow root прикрепляется поздно без mutation host | attachShadow на старом div в середине DISCOVER | S02 | Ограниченный повторный host-pass |
| Cross-origin hidden iframe выигрывает scoring | Visible video и огромный hidden child | S03 | Исправить IO/геометрию; не добавлять случайные селекторы |
| Parent iframe удалён до child report | Удаление target iframe/его host при отключённом child report | S03 | Parent chain watcher |
| Вкладка меняет URL во время async apply | Controlled delayed ACK + pushState/reload | S04 | Invalidation fence и identity checks |
| Worker спит между шагами | Реально дать MV3 уснуть без DevTools keepalive | S04 | Session store + адресная reconciliation |
| Плеер использует media reuse без observable identity | Собственная fixture со сменой кадров same stream | S05 | Документировать ограничение; не заявлять новый фильм распознанным |
| !important/transition/site WAAPI скрывают effect | CSS-conflict matrix | S05 | Корректный OFF/conflict; совместимость не симулировать |
| Native controls/captions отражаются иначе | Визуальный smoke | S05 | Честное описание; не менять UA DOM |
| Нагрузка на mutation-heavy сайте | OFF/ON профиль и 100 циклов | S06 | Отключать discovery, ограничивать очереди/cleanup |
| Нет доступа к реальному VK/live | Manual user-accessible sample | S07 | Не утверждать live verification; явно оставить релизный gate |
| Широкие host permissions вызывают review-вопросы | Review фактического manifest + пояснение функций | S07 | Удалить ненужное; optional flow — только отдельное scope decision |

## Как избежать бесконечного spike

У каждого spike один вопрос и несколько минимальных fixtures. После проверенного ответа
зафиксировать evidence/ADR и переходить к реализации. Если отсутствует браузер/авторизация,
это environment blocker, а не доказательство невозможности технологии. Выполнить доступные
проверки и оставить точную процедуру для недостающих; не изобретать PASS.

Архитектурные альтернативы не нужно реализовывать все. В v1 один rendering backend,
один permission model, один state writer, одна схема cleanup и один путь ручной активации.

S07 (2026-09-13): доступный публичный VK recording и настоящий Chrome toolbar popup прошли в
чистом Chrome for Testing 153 profile. Generated permissions сопоставлены с фактическим runtime,
а shipping/source ZIP проверены allowlists и повторными hashes. Firefox manual UI и Edge/Brave
остаются `NOT_RUN`; owner metadata/license/privacy URL блокируют только публичную submission.

S08 (2026-09-13): стабильный Firefox ID, support homepage, EN/RU selector и store assets прошли
manifest/unit/Chromium/Firefox native gates. Для Chrome локальная обработка video DOM и URL
fingerprint раскрывается как website content/browsing activity; Firefox `none` описывает отсутствие
сбора и передачи наружу. Privacy HTML подготовлен, но его публичный URL ещё не размещён.
Toolbar screenshot выявил лишнее store-padding у state icon; OFF/ON canvas occupancy увеличен с
75% до 97% и повторно проверен на 16/128 px и в обеих MV3 builds.
