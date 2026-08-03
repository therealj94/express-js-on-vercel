// utils/format.ts
import { t, getLang, MONTHS_I18N } from './i18n';
export const usd = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const usdt = (n: number, dec = 2) =>
  n.toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + ' USDT';

export const pct = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}%`;

export const compact = (n: number) => {
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1) + 'B';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1) + 'M';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(1) + 'K';
  return n.toFixed(0);
};

export const maskEmail = (email: string) => {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${'*'.repeat(Math.max(2, user.length - visible.length))}@${domain}`;
};

export const maskPhone = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return phone;
  return `${'•'.repeat(Math.max(2, digits.length - 4))} ${digits.slice(-4)}`;
};

export const shortDate = (ts: number) => {
  const d = new Date(ts);
  return `${d.getDate()} ${MONTHS_I18N[getLang()][d.getMonth()]} ${d.getFullYear()}`;
};

export const timeAgo = (ts: number) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return t('time.now');
  const m = Math.floor(s / 60);
  if (m < 60) return t('time.min', { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t('time.hr', { n: h });
  const d = Math.floor(h / 24);
  return t('time.day', { n: d });
};
