/**
 * i18next setup (NFR-06). Keys are flat and dotted (`action.nap`, `event.<id>.text`), so the key and namespace
 * separators are off. UI copy ships in the initial bundle; game copy (`@fastlane/content` locales) is added when the
 * game chunk loads (`addContentStrings`).
 */
import i18next, { type i18n as I18n } from 'i18next';
import { initReactI18next } from 'react-i18next';
import ui from './ui.en.json' with { type: 'json' };

export const i18n: I18n = i18next.createInstance();

void i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  resources: { en: { translation: ui } },
  keySeparator: false,
  nsSeparator: false,
  interpolation: { escapeValue: false },
  initAsync: false,
  returnNull: false,
});

/** Merge the game's own copy (location, action, event, feed… strings) into the English bundle. */
export function addContentStrings(strings: Record<string, string>): void {
  i18n.addResourceBundle('en', 'translation', strings, true, false);
}

export const t = (key: string, params: Record<string, unknown> = {}): string => i18n.t(key, params);
