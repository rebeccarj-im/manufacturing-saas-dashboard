// src/lib/timeframe.ts
export type ApiRange = "6m" | "12m";
export type Granularity = "month" | "quarter";

const KEY = "ed:timeframe";

export function loadTimeframe():
  | { range: ApiRange; granularity: Granularity }
  | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveTimeframe(range: ApiRange, granularity: Granularity) {
  localStorage.setItem(KEY, JSON.stringify({ range, granularity }));
}

export function buildQuery(
  range?: ApiRange,
  granularity?: Granularity
): string {
  const tf = loadTimeframe();
  const r = range ?? tf?.range ?? "12m";
  const g = granularity ?? tf?.granularity ?? "month";
  return `?range=${r}&granularity=${g}`;
}
