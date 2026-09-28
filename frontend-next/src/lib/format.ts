// Small, pure, dependency-free formatting helpers -- kept isolated from
// components specifically so they're easy to unit test with Vitest
// (see src/lib/format.test.ts).

export function formatScore(score: number): string {
  return score.toFixed(1);
}

export function riskLabel(score: number): "critical" | "high" | "moderate" | "low" {
  if (score >= 90) return "critical";
  if (score >= 70) return "high";
  if (score >= 40) return "moderate";
  return "low";
}

export function formatBTC(value: number, digits = 6): string {
  return `${value.toFixed(digits).replace(/0+$/, "").replace(/\.$/, "")} BTC`;
}

export function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

export function truncateId(id: string, head = 8, tail = 4): string {
  if (!id || id.length <= head + tail + 2) return id;
  return `${id.slice(0, head)}…${id.slice(-tail)}`;
}

export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

export function formatEpoch(epoch: number | null | undefined): string {
  if (epoch === null || epoch === undefined) return "—";
  return new Date(epoch * 1000).toISOString().replace("T", " ").slice(0, 19) + " UTC";
}

export function pluralize(count: number, noun: string, plural?: string): string {
  return count === 1 ? `${count} ${noun}` : `${count} ${plural ?? noun + "s"}`;
}
