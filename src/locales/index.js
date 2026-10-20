// src/locales/index.js
import { id } from './id';
import { en } from './en';

export const locales = { id, en };
export { id, en };

export const defaultLocale = 'id';

export function getLocaleTexts(lang = defaultLocale) {
  return locales[lang] || locales[defaultLocale];
}

export default locales;

