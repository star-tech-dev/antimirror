import './style.css';
import { browser } from 'wxt/browser';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { TabState } from '../../src/shared/state';

const buttonElement = document.querySelector<HTMLButtonElement>('#toggle');
const statusElement = document.querySelector<HTMLElement>('#status');
let state: TabState | undefined;

if (!buttonElement || !statusElement) throw new Error('Popup markup is incomplete');
const button = buttonElement;
const status = statusElement;
const [active] = await browser.tabs.query({ active: true, currentWindow: true });
const tabId = active?.id;

const messages: Record<string, string> = {
  INITIAL: 'Выключено', USER: 'Выключено', NO_VIDEO: 'Подходящее видео не найдено',
  AMBIGUOUS_TARGET: 'Найдено несколько видео', NAVIGATION: 'Выключено после загрузки страницы',
  AGENT_UNAVAILABLE: 'Страница недоступна. Обновите её и попробуйте снова',
  APPLY_FAILED: 'Не удалось применить отражение', TRANSFORM_CONFLICT: 'Стили страницы мешают отражению',
};

function render(next?: TabState): void {
  state = next;
  if (!next) { status.textContent = 'Не удалось прочитать состояние'; button.disabled = true; return; }
  const busy = next.phase === 'searching' || next.phase === 'applying' || next.phase === 'disabling';
  status.textContent = next.phase === 'on' ? 'Видео отражено' : next.phase === 'off'
    ? messages[next.reason] ?? 'Выключено' : next.phase === 'searching' ? 'Поиск видео…' : 'Применение…';
  button.textContent = next.phase === 'on' ? 'Выключить' : busy ? 'Отменить' : 'Включить';
  button.disabled = tabId === undefined;
  button.setAttribute('aria-pressed', String(next.phase === 'on'));
}

async function send(type: 'GET_STATE' | 'SET_ENABLED', desired?: boolean): Promise<TabState | undefined> {
  if (tabId === undefined) return undefined;
  try {
    return await browser.runtime.sendMessage({ protocolVersion: PROTOCOL_VERSION, type, tabId,
      requestId: crypto.randomUUID(), ...(type === 'SET_ENABLED' ? { desired } : {}) });
  } catch { return undefined; }
}

button.addEventListener('click', async () => {
  const desired = state?.phase === 'off';
  if (desired === undefined) return;
  if (desired) render({ phase: 'searching', tabId: tabId!, revision: state!.revision + 1,
    operationId: 'pending-ui', topDocumentNonce: 'pending-ui' });
  else button.textContent = 'Выключение…';
  render(await send('SET_ENABLED', desired));
});

render(await send('GET_STATE'));
