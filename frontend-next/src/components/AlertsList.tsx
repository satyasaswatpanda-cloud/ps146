"use client";

import { useState, useMemo } from "react";
import type { Alert } from "@/types/api";
import { formatScore, riskLabel, truncateId } from "@/lib/format";

const RISK_COLOR: Record<string, string> = {
  critical: "var(--accent-red)",
  high: "var(--accent-copper)",
  moderate: "var(--accent-blue)",
  low: "var(--text-muted)",
};

export default function AlertsList({
  alerts,
  selectedId,
  onSelect,
}: {
  alerts: Alert[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [filterRisk, setFilterRisk] = useState<"all" | "critical" | "high" | "moderate">("all");

  const counts = useMemo(() => {
    let critical = 0;
    let high = 0;
    let moderate = 0;
    for (const a of alerts) {
      const r = riskLabel(a.score);
      if (r === "critical") critical++;
      else if (r === "high") high++;
      else if (r === "moderate") moderate++;
    }
    return { critical, high, moderate };
  }, [alerts]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return alerts.filter((a) => {
      const risk = riskLabel(a.score);
      if (filterRisk !== "all" && risk !== filterRisk) return false;
      if (!q) return true;
      return (
        a.id.toLowerCase().includes(q) ||
        a.txid.toLowerCase().includes(q) ||
        a.src_ip?.toLowerCase().includes(q) ||
        a.geo_country?.toLowerCase().includes(q) ||
        a.asn?.toLowerCase().includes(q) ||
        a.reasons.some((r) => r.toLowerCase().includes(q)) ||
        a.patterns.some((p) => p.toLowerCase().includes(q))
      );
    });
  }, [alerts, search, filterRisk]);

  if (alerts.length === 0) {
    return (
      <div className="p-6 text-sm" style={{ color: "var(--text-muted)" }}>
        No alerts raised for this batch.
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Search & Severity Filter Bar */}
      <div className="border-b p-2.5 flex flex-col gap-2 shrink-0" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)" }}>
        <div className="relative flex items-center">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter alerts (txid, IP, rule)..."
            className="w-full rounded border px-2.5 py-1 text-xs outline-none transition-colors focus:border-[var(--accent-copper)]"
            style={{
              borderColor: "var(--border-hair)",
              background: "var(--bg-inset)",
              color: "var(--text-primary)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 text-[10px] text-gray-400 hover:text-white"
            >
              ✕
            </button>
          )}
        </div>

        {/* Risk Level Pills */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setFilterRisk("all")}
            className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
            style={{
              background: filterRisk === "all" ? "var(--bg-panel-raised)" : "transparent",
              color: filterRisk === "all" ? "var(--text-primary)" : "var(--text-muted)",
              border: "1px solid",
              borderColor: filterRisk === "all" ? "var(--border-hair)" : "transparent",
            }}
          >
            All ({alerts.length})
          </button>
          {counts.critical > 0 && (
            <button
              type="button"
              onClick={() => setFilterRisk("critical")}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                background: filterRisk === "critical" ? "var(--accent-red-soft)" : "transparent",
                color: filterRisk === "critical" ? "var(--accent-red)" : "var(--text-muted)",
                border: "1px solid",
                borderColor: filterRisk === "critical" ? "var(--accent-red)" : "transparent",
              }}
            >
              Crit ({counts.critical})
            </button>
          )}
          {counts.high > 0 && (
            <button
              type="button"
              onClick={() => setFilterRisk("high")}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                background: filterRisk === "high" ? "rgba(217, 119, 6, 0.15)" : "transparent",
                color: filterRisk === "high" ? "var(--accent-copper)" : "var(--text-muted)",
                border: "1px solid",
                borderColor: filterRisk === "high" ? "var(--accent-copper)" : "transparent",
              }}
            >
              High ({counts.high})
            </button>
          )}
          {counts.moderate > 0 && (
            <button
              type="button"
              onClick={() => setFilterRisk("moderate")}
              className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
              style={{
                background: filterRisk === "moderate" ? "rgba(59, 130, 246, 0.15)" : "transparent",
                color: filterRisk === "moderate" ? "var(--accent-blue)" : "var(--text-muted)",
                border: "1px solid",
                borderColor: filterRisk === "moderate" ? "var(--accent-blue)" : "transparent",
              }}
            >
              Mod ({counts.moderate})
            </button>
          )}
        </div>
      </div>

      {/* Alerts Items */}
      {filtered.length === 0 ? (
        <div className="p-4 text-center text-xs" style={{ color: "var(--text-muted)" }}>
          No alerts match the active filter.
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setFilterRisk("all");
            }}
            className="block mx-auto mt-2 text-[11px] underline"
            style={{ color: "var(--accent-teal)" }}
          >
            Reset Filters
          </button>
        </div>
      ) : (
        <ul className="flex flex-col overflow-y-auto custom-scrollbar flex-1" role="list" aria-label="Alerts">
          {filtered.map((a) => {
            const risk = riskLabel(a.score);
            const active = a.id === selectedId;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => onSelect(a.id)}
                  className="flex w-full items-center gap-3 border-b px-4 py-3 text-left transition-colors hover:brightness-110"
                  style={{
                    borderColor: "var(--border-hair-soft)",
                    background: active ? "var(--bg-panel-raised)" : "transparent",
                  }}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: RISK_COLOR[risk] }}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="data text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                        {a.id}
                      </span>
                      <span className="data text-xs font-bold" style={{ color: RISK_COLOR[risk] }}>
                        {formatScore(a.score)}
                      </span>
                    </div>
                    <div className="truncate text-xs mt-0.5" style={{ color: "var(--text-muted)" }}>
                      {truncateId(a.txid)} · {a.src_ip}
                      {a.geo_country ? ` · ${a.geo_country}` : ""}
                    </div>
                    {a.patterns.length > 0 && (
                      <div className="mt-1 truncate text-[11px] font-mono" style={{ color: "var(--accent-teal)" }}>
                        {a.patterns[0]}
                      </div>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

