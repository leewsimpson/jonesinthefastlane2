/** Number, money and time formatting by locale (NFR-06). The engine counts cents and minutes; this shows them. */
import { i18n, t } from './i18n.ts';

const moneyFormats = new Map<string, Intl.NumberFormat>();

/** Cents are shown only below this many cents ($10), where a few cents are a real share of the amount. */
const CENTS_BELOW = 1000;

function moneyFormat(cents: boolean): Intl.NumberFormat {
  const lng = i18n.language || 'en';
  const key = `${lng}:${cents ? 2 : 0}`;
  let f = moneyFormats.get(key);
  if (!f) {
    f = new Intl.NumberFormat(lng, {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: cents ? 2 : 0,
      maximumFractionDigits: cents ? 2 : 0,
    });
    moneyFormats.set(key, f);
  }
  return f;
}

/**
 * Cents → "$1,235". Whole dollars, rounded half up, so cash, prices and recaps agree; amounts under $10 that aren't
 * whole keep their cents ("$4.01") because there they matter.
 */
export function money(cents: number): string {
  const abs = Math.abs(cents);
  const showCents = abs < CENTS_BELOW && abs % 100 !== 0;
  const value = showCents ? abs / 100 : Math.floor(abs / 100 + 0.5);
  const text = moneyFormat(showCents).format(value);
  return cents < 0 && value !== 0 ? `−${text}` : text;
}

/** Minutes → "2h 30m", "45m", "3h". */
export function duration(minutes: number): string {
  const sign = minutes < 0 ? '−' : '';
  const abs = Math.abs(minutes);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  if (h && m) return sign + t('unit.hm', { h, m });
  if (h) return sign + t('unit.h', { h });
  return sign + t('unit.m', { m });
}

/** Basis points → "42%". */
export function percent(bp: number): string {
  return `${Math.round(bp / 100)}%`;
}

/** A signed number with a real minus sign: "+3", "−2". */
export function signed(n: number): string {
  return n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0';
}

/** A signed amount of cents: "+$40", "−$12". */
export function signedMoney(cents: number): string {
  return cents > 0 ? `+${money(cents)}` : cents < 0 ? `−${money(-cents)}` : money(0);
}
