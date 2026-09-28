"use client";

import type { AnalysisSummary, PatternsBlock, EntitiesBlock, WalletClusters, NetworkBridge } from "@/types/api";
import { formatDuration, pluralize } from "@/lib/format";

export default function SummaryHero({
  summary,
  patterns,
  entities,
  walletClusters,
  bridges,
  onNavigateTab,
}: {
  summary: AnalysisSummary;
  patterns: PatternsBlock;
  entities: EntitiesBlock;
  walletClusters?: WalletClusters;
  bridges?: NetworkBridge[];
  onNavigateTab?: (tab: "overview" | "investigation" | "patterns" | "entities" | "clusters" | "cases") => void;
}) {
  const stats = [
    {
      label: "Transactions Ingested",
      value: summary.records,
      sub: `${formatDuration(summary.runtime_seconds)} runtime`,
      accent: "var(--text-primary)",
      tab: null,
    },
    {
      label: "Anomalies & Alerts",
      value: summary.alerts,
      sub: "High-risk detections",
      accent: "var(--accent-red)",
      tab: "investigation" as const,
    },
    {
      label: "Obfuscation Typologies",
      value: patterns.summary.peeling_chains + patterns.summary.mixing_events,
      sub: `${patterns.summary.peeling_chains} chains · ${patterns.summary.mixing_events} mixers`,
      accent: "var(--accent-copper)",
      tab: "patterns" as const,
    },
    {
      label: "Resolved Entities",
      value: entities.summary.multi_wallet_entities,
      sub: `${entities.summary.wallets} tracked wallets`,
      accent: "var(--accent-teal)",
      tab: "entities" as const,
    },
    {
      label: "Behavioral Clusters",
      value: walletClusters?.clusters?.length ?? 0,
      sub: `${walletClusters?.outlier_count ?? 0} DBSCAN outliers`,
      accent: "#c084fc",
      tab: "clusters" as const,
    },
    {
      label: "Network Bridge Nodes",
      value: bridges?.length ?? 0,
      sub: "Multi-actor relay IPs",
      accent: "var(--accent-blue)",
      tab: "entities" as const,
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* Top Headline Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-l-2 pl-4" style={{ borderColor: "var(--accent-copper)" }}>
        <div>
          <h1 className="text-base font-bold tracking-tight" style={{ color: "var(--text-primary)" }}>
            Forensic Intelligence & Network Correlation Overview
          </h1>
          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
            Offline Bitcoin network-blockchain correlation platform · Model: <span className="font-mono text-gray-300">{summary.model}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[11px] font-mono px-2 py-1 rounded border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair)", color: "var(--accent-teal)" }}>
            {pluralize(summary.records, "record")} in {formatDuration(summary.runtime_seconds)}
          </span>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {stats.map((s) => {
          const isClickable = Boolean(s.tab && onNavigateTab);
          return (
            <div
              key={s.label}
              onClick={() => {
                if (s.tab && onNavigateTab) onNavigateTab(s.tab);
              }}
              className={`rounded-sm border p-3 flex flex-col justify-between transition-all ${
                isClickable ? "cursor-pointer hover:border-[var(--border-strong)] hover:brightness-110 shadow-sm" : ""
              }`}
              style={{
                borderColor: "var(--border-hair)",
                background: "var(--bg-panel)",
              }}
              title={isClickable ? `Click to inspect ${s.label}` : undefined}
            >
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-mono font-medium truncate" style={{ color: "var(--text-muted)" }}>
                  {s.label}
                </span>
                {isClickable && (
                  <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
                    ↗
                  </span>
                )}
              </div>
              <div className="data text-2xl font-bold my-1" style={{ color: s.accent }}>
                {s.value}
              </div>
              <div className="text-[10px] font-mono truncate" style={{ color: "var(--text-secondary)" }}>
                {s.sub}
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {summary.data_notice}
      </p>
    </div>
  );
}

