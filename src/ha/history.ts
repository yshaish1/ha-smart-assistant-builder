import type { HassLike } from './adapter.real.js';

export interface HistoryPoint { t: number; v: number }

export async function fetchHistory(hass: HassLike, entityId: string, hours = 24): Promise<HistoryPoint[]> {
  const end = new Date();
  const start = new Date(end.getTime() - hours * 3600 * 1000);
  try {
    const result = await hass.connection.sendMessagePromise<Record<string, Array<{ s: string; lu?: number; a?: Record<string, unknown> }>>>({
      type: 'history/history_during_period',
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      minimal_response: true,
      no_attributes: true,
      entity_ids: [entityId],
    });
    const rows = result?.[entityId] ?? [];
    const out: HistoryPoint[] = [];
    for (const row of rows) {
      const v = parseFloat(row.s);
      if (Number.isFinite(v)) out.push({ t: (row.lu ?? 0) * 1000, v });
    }
    return out.length > 1 ? out : mockSeries(entityId, hours);
  } catch {
    return mockSeries(entityId, hours);
  }
}

export function mockSeries(seedKey: string, hours = 24): HistoryPoint[] {
  const now = Date.now();
  const points: HistoryPoint[] = [];
  const seed = hashString(seedKey);
  const rng = mulberry32(seed);
  const base = 18 + rng() * 8;
  const drift = (rng() - 0.5) * 4;
  const total = hours * 4;
  for (let i = total; i >= 0; i--) {
    const t = now - i * 15 * 60_000;
    const noise = (rng() - 0.5) * 1.5;
    const wave = Math.sin((i / 12) * Math.PI) * 1.2;
    points.push({ t, v: base + drift * (1 - i / total) + wave + noise });
  }
  return points;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
