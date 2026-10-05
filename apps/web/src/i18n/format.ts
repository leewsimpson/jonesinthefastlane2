/** Number, money and time formatting by locale (NFR-06). The engine counts cents and minutes; this shows them. */
import { i18n, t } from './i18n.ts';

const moneyFormats = new Map<string, Intl.NumberFormat>();

function moneyFormat(): Intl.NumberFormat {
  const lng = i18n.language || 'en';
  let f = moneyFormats.get(lng);
  if (!f) {
    f = new Intl.NumberFormat(lng, { style: 'currency', currency: 'USD' });
    moneyFormats.set(lng, f);
  }
  return f;
}

/** Cents → "$1,234.50". Whole dollars drop the cents. */
export function money(cents: number): string {
  const f = moneyFormat();
  const dollars = cents / 100;
  if (Number.isInteger(dollars))
    return new Intl.NumberFormat(f.resolvedOptions().locale, {
      style: 'currency',
      currency: 'USD',
      maximumFractionDigits: 0,
    }).format(dollars);
  return f.format(dollars);
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
