/** Dates affichage FR : JJ/MM/AAAA */

export function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** Date locale → `AAAA-MM-JJ` (stockage interne) */
export function toLocalYmd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** `AAAA-MM-JJ` → Date locale midi */
export function parseLocalYmd(ymd: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd.trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
}

/** Affichage `JJ/MM/AAAA` */
export function formatDateSlash(input: string | Date): string {
  const d = typeof input === 'string' ? (input.includes('T') || input.includes('-')
    ? new Date(input.includes('T') ? input : `${input}T12:00:00`)
    : parseLocalYmd(input)) : input;
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Parse `JJ/MM/AAAA` ou `AAAA-MM-JJ` → ymd */
export function parseFlexibleDate(raw: string): string | null {
  const s = raw.trim();
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (fr) {
    const d = Number(fr[1]);
    const mo = Number(fr[2]);
    const y = Number(fr[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return `${y}-${pad2(mo)}-${pad2(d)}`;
  }
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
}

export function monthKeyFromDate(input: string | Date): string {
  const d = typeof input === 'string' ? new Date(input) : input;
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

export function formatMonthLabel(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}
