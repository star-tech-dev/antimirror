export const POPUP_LOCALES = ['en', 'ru'] as const;
export type PopupLocale = typeof POPUP_LOCALES[number];

export interface LocaleMessage {
  message: string;
  placeholders?: Record<string, { content: string }>;
}

export type LocaleCatalog = Record<string, LocaleMessage>;

export function normalizePopupLocale(value: unknown): PopupLocale {
  const locale = typeof value === 'string' ? value.toLowerCase().split(/[-_]/)[0] : undefined;
  return locale === 'ru' ? 'ru' : 'en';
}

export function catalogMessage(
  catalog: LocaleCatalog,
  key: string,
  substitutions?: string | string[],
): string | undefined {
  const entry = catalog[key];
  if (!entry?.message) return undefined;
  const values = substitutions === undefined ? [] : Array.isArray(substitutions) ? substitutions : [substitutions];
  let message = entry.message;
  for (const [name, placeholder] of Object.entries(entry.placeholders ?? {})) {
    const match = /^\$(\d+)$/.exec(placeholder.content);
    const value = match ? values[Number(match[1]) - 1] : undefined;
    if (value !== undefined) message = message.split(`$${name.toUpperCase()}$`).join(value);
  }
  return message;
}
