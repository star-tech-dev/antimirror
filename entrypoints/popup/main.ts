import './style.css';
import { browser } from 'wxt/browser';
import { PROTOCOL_VERSION } from '../../src/shared/protocol';
import type { TabState } from '../../src/shared/state';
import { catalogMessage, normalizePopupLocale, type LocaleCatalog, type PopupLocale } from '../../src/popup/localization';

const buttonElement = document.querySelector<HTMLButtonElement>('#toggle');
const statusElement = document.querySelector<HTMLElement>('#status');
const shortcutElement = document.querySelector<HTMLElement>('#shortcut');
const languageElement = document.querySelector<HTMLSelectElement>('#language');
const languageLabelElement = document.querySelector<HTMLElement>('#language-label');
const markElement = document.querySelector<HTMLImageElement>('#mark');
let state: TabState | undefined;
let commandShortcut = '';

if (!buttonElement || !statusElement || !shortcutElement || !languageElement || !languageLabelElement || !markElement) {
  throw new Error('Popup markup is incomplete');
}
const button = buttonElement;
const status = statusElement;
const shortcut = shortcutElement;
const language = languageElement;
const languageLabel = languageLabelElement;
const mark = markElement;
const getMessage = browser.i18n.getMessage as (key: string, substitutions?: string | string[]) => string;
const POPUP_LOCALE_KEY = 'popupLocale';
let locale: PopupLocale = 'en';
let catalog: LocaleCatalog = {};
const t = (key: string, substitutions?: string | string[]) =>
  catalogMessage(catalog, key, substitutions) ?? (getMessage(key, substitutions) || key);

async function loadLocale(nextLocale: PopupLocale): Promise<void> {
  locale = nextLocale;
  try {
    const response = await fetch(browser.runtime.getURL(`/_locales/${locale}/messages.json`));
    if (!response.ok) throw new Error(`Locale ${locale} returned ${response.status}`);
    catalog = await response.json() as LocaleCatalog;
  } catch { catalog = {}; }
  document.documentElement.lang = locale;
  language.value = locale;
  document.title = t('extensionName');
  document.querySelector('h1')!.textContent = t('extensionNameShort');
  languageLabel.textContent = t('languageLabel');
  language.title = t('languageLabel');
  language.options[0]!.textContent = t('languageEnglish');
  language.options[1]!.textContent = t('languageRussian');
}
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
  shortcut.textContent = commandShortcut ? t('shortcutAssigned', commandShortcut) : t('shortcutUnassigned');
  if (!next) { status.textContent = t('stateReadFailed'); button.textContent = t('waiting'); button.disabled = true; return; }
  const busy = next.phase === 'searching' || next.phase === 'applying' || next.phase === 'disabling';
  status.textContent = next.phase === 'on' ? t('on') : next.phase === 'off'
    ? t(messages[next.reason] ?? 'off') : next.phase === 'searching' ? t('searching') : t('applying');
  if (next.phase === 'on' && next.coverageWarning) status.textContent += `. ${t(next.coverageWarning === 'OPEN_ROOTS_ONLY'
    ? 'warningOpenRoots' : 'warningFrames')}`;
  button.textContent = next.phase === 'on' ? t('turnOff') : busy ? t('cancel') : t('turnOn');
  button.disabled = tabId === undefined;
  button.setAttribute('aria-pressed', String(next.phase === 'on'));
  mark.src = browser.runtime.getURL(`/icons/${next.phase === 'on' ? 'on' : 'off'}-32.png`);
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

language.addEventListener('change', async () => {
  const nextLocale = normalizePopupLocale(language.value);
  await browser.storage.local.set({ [POPUP_LOCALE_KEY]: nextLocale }).catch(() => undefined);
  await loadLocale(nextLocale);
  render(state);
});

const savedLocale = await browser.storage.local.get(POPUP_LOCALE_KEY).catch(() => ({})) as Record<string, unknown>;
await loadLocale(normalizePopupLocale(savedLocale[POPUP_LOCALE_KEY] ?? browser.i18n.getUILanguage()));
status.textContent = t('checking');
button.textContent = t('waiting');
try {
  const command = (await browser.commands.getAll()).find(item => item.name === 'toggle-mirror');
  commandShortcut = command?.shortcut ?? '';
} catch { commandShortcut = ''; }
render(await send('GET_STATE'));
