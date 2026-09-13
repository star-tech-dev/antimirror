import './style.css';
import { browser } from 'wxt/browser';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { TabState } from '../../src/shared/state';

const buttonElement = document.querySelector<HTMLButtonElement>('#toggle');
const statusElement = document.querySelector<HTMLElement>('#status');
const shortcutElement = document.querySelector<HTMLElement>('#shortcut');
let state: TabState | undefined;

if (!buttonElement || !statusElement || !shortcutElement) throw new Error('Popup markup is incomplete');
const button = buttonElement;
const status = statusElement;
const shortcut = shortcutElement;
const getMessage = browser.i18n.getMessage as (key: string, substitutions?: string | string[]) => string;
const t = (key: string, substitutions?: string | string[]) => getMessage(key, substitutions) || key;
document.documentElement.lang = browser.i18n.getUILanguage().split('-')[0] ?? 'en';
document.title = t('extensionName');
document.querySelector('h1')!.textContent = t('extensionName');
status.textContent = t('checking');
button.textContent = t('waiting');
const [active] = await browser.tabs.query({ active: true, currentWindow: true });
const tabId = active?.id;

const messages: Record<string, string> = {
  INITIAL: 'off', USER: 'off', NO_VIDEO: 'reasonNoVideo', AMBIGUOUS_TARGET: 'reasonAmbiguous',
  NAVIGATION: 'reasonNavigation', INCOMPLETE_COVERAGE: 'reasonIncomplete', TARGET_LOST: 'reasonTargetLost',
  MEDIA_CHANGED: 'reasonMediaChanged', PLAYBACK_ENDED: 'reasonPlaybackEnded', PIP_UNSUPPORTED: 'reasonPip',
  EFFECT_LOST: 'reasonEffectLost', FRAMES_UNAVAILABLE: 'reasonFrames', PERMISSION_DENIED: 'reasonPermission',
  AGENT_UNAVAILABLE: 'reasonAgent', APPLY_FAILED: 'reasonApply', TRANSFORM_CONFLICT: 'reasonConflict',
};

function render(next?: TabState): void {
  state = next;
  if (!next) { status.textContent = t('stateReadFailed'); button.disabled = true; return; }
  const busy = next.phase === 'searching' || next.phase === 'applying' || next.phase === 'disabling';
  status.textContent = next.phase === 'on' ? t('on') : next.phase === 'off'
    ? t(messages[next.reason] ?? 'off') : next.phase === 'searching' ? t('searching') : t('applying');
  if (next.phase === 'on' && next.coverageWarning) status.textContent += `. ${t(next.coverageWarning === 'OPEN_ROOTS_ONLY'
    ? 'warningOpenRoots' : 'warningFrames')}`;
  button.textContent = next.phase === 'on' ? t('turnOff') : busy ? t('cancel') : t('turnOn');
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
  else button.textContent = t('turningOff');
  render(await send('SET_ENABLED', desired));
});

try {
  const command = (await browser.commands.getAll()).find(item => item.name === 'toggle-mirror');
  shortcut.textContent = command?.shortcut ? t('shortcutAssigned', command.shortcut) : t('shortcutUnassigned');
} catch { shortcut.textContent = t('shortcutUnassigned'); }
render(await send('GET_STATE'));
