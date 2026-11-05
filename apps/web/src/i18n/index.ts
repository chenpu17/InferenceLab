import { useLabStore } from '../store/useLabStore';
import { localize, translate } from './core';
import type { Locale, MessageParams } from './types';

export type { Locale, MessageParams } from './types';
export { en, hasEnglish, interpolate } from './core';

export function t(source: string, params?: MessageParams, locale?: Locale): string {
  return translate(source, locale ?? useLabStore.getState().locale, params);
}

export function lt(text: string | null | undefined, locale?: Locale): string {
  return localize(text, locale ?? useLabStore.getState().locale);
}

export function useI18n(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (source: string, params?: MessageParams) => string;
  lt: (text: string | null | undefined) => string;
} {
  const locale = useLabStore((state) => state.locale);
  const setLocale = useLabStore((state) => state.setLocale);
  return {
    locale,
    setLocale,
    t: (source, params) => translate(source, locale, params),
    lt: (text) => localize(text, locale),
  };
}
