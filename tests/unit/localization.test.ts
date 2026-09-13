import { describe, expect, it } from 'vitest';
import { catalogMessage, normalizePopupLocale } from '../../src/popup/localization';

describe('popup localization', () => {
  it('normalizes supported browser and stored locales', () => {
    expect(normalizePopupLocale('ru-RU')).toBe('ru');
    expect(normalizePopupLocale('RU_ru')).toBe('ru');
    expect(normalizePopupLocale('de-DE')).toBe('en');
    expect(normalizePopupLocale(undefined)).toBe('en');
  });

  it('resolves catalog placeholders without executing catalog text', () => {
    const catalog = { shortcutAssigned: {
      message: 'Shortcut: $SHORTCUT$', placeholders: { shortcut: { content: '$1' } },
    } };
    expect(catalogMessage(catalog, 'shortcutAssigned', 'Alt+Shift+M')).toBe('Shortcut: Alt+Shift+M');
    expect(catalogMessage(catalog, 'missing')).toBeUndefined();
  });
});
