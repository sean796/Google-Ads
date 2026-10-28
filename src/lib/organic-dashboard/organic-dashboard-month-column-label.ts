/** Column header for period-progress tables: abbreviated month only (e.g. Jan, May). */
export function formatOrganicDashboardMonthColumn(yearMonthOrLabel: string): string {
  const raw = yearMonthOrLabel.trim();
  if (!raw) return raw;

  const ga4YearMonth = /^(\d{4})(\d{2})$/.exec(raw);
  if (ga4YearMonth) {
    const y = Number(ga4YearMonth[1]);
    const m = Number(ga4YearMonth[2]);
    if (Number.isFinite(y) && m >= 1 && m <= 12) {
      return new Date(y, m - 1, 1).toLocaleString("en-CA", { month: "short" });
    }
  }

  const iso = /^(\d{4})-(\d{2})$/.exec(raw);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]);
    if (Number.isFinite(y) && m >= 1 && m <= 12) {
      return new Date(y, m - 1, 1).toLocaleString("en-CA", { month: "short" });
    }
  }

  const isoDay = /^(\d{4})-(\d{2})-\d{2}$/.exec(raw);
  if (isoDay) {
    const y = Number(isoDay[1]);
    const m = Number(isoDay[2]);
    if (Number.isFinite(y) && m >= 1 && m <= 12) {
      return new Date(y, m - 1, 1).toLocaleString("en-CA", { month: "short" });
    }
  }

  const monthWord = raw.match(/^([A-Za-z]{3,9})\b/);
  if (monthWord) {
    const token = monthWord[1]!;
    const parsed = Date.parse(`${token} 1, 2000`);
    if (Number.isFinite(parsed)) {
      return new Date(parsed).toLocaleString("en-CA", { month: "short" });
    }
  }

  return raw;
}
