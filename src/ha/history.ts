export interface HistoryPoint {
  t: number;
  v: number;
}

export interface HistorySource {
  fetchHistory(entityId: string, hours?: number): Promise<HistoryPoint[]>;
}

export class MockHistorySource implements HistorySource {
  async fetchHistory(entityId: string, hours = 24): Promise<HistoryPoint[]> {
    const now = Date.now();
    const points: HistoryPoint[] = [];
    const seed = hashString(entityId);
    const rng = mulberry32(seed);
    const base = 18 + rng() * 8;
    const drift = (rng() - 0.5) * 4;
    for (let i = hours * 4; i >= 0; i--) {
      const t = now - i * 15 * 60_000;
      const noise = (rng() - 0.5) * 1.5;
      const wave = Math.sin((i / 12) * Math.PI) * 1.2;
      points.push({ t, v: base + drift * (i / (hours * 4)) + wave + noise });
    }
    return points;
  }
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
