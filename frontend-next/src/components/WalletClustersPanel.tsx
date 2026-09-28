"use client";

import { useState, useMemo } from "react";
import type { WalletClusters, GraphAnalyticsStage } from "@/types/api";
import { truncateId } from "@/lib/format";

const PROFILE_LABELS: Record<string, string> = {
  tx_as_input: "Sender (Input) Ratio",
  tx_as_output: "Receiver (Output) Ratio",
  distinct_ips: "Distinct Relay IPs",
  mean_output_fanout: "Avg Output Fan-out",
  nonstandard_port_share: "Non-standard Port Share",
  pattern_share: "Obfuscation Pattern Share",
};

export default function WalletClustersPanel({
  wc,
  graphAnalytics,
}: {
  wc: WalletClusters;
  graphAnalytics: GraphAnalyticsStage | null;
}) {
  const [searchWallet, setSearchWallet] = useState("");
  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [showOutliers, setShowOutliers] = useState(false);

  // Safe accessor for clusters
  const clusters = useMemo(() => wc?.clusters ?? [], [wc]);
  const outliers = useMemo(() => wc?.outliers ?? [], [wc]);

  // Filter cohorts by search term if provided
  const filteredClusters = useMemo(() => {
    if (!searchWallet.trim()) return clusters;
    const q = searchWallet.trim().toLowerCase();
    return clusters.filter((c) => {
      const matchId = c.cluster_id.toLowerCase().includes(q);
      const matchWallet = c.sample_wallets?.some((w) => w.toLowerCase().includes(q));
      return matchId || matchWallet;
    });
  }, [clusters, searchWallet]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 custom-scrollbar">
      {/* Header Overview Banner */}
      <div className="rounded-sm border p-4" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Behavioural Clustering &amp; Graph Analytics
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Wallets operated by the same syndicate or automated script often share distinct operational habits (e.g. payout size distributions, fan-out ratios, broadcast cadence). Using <strong>DBSCAN</strong> over combined structural graph embeddings and behavioural vectors, ANTARDRISHTI groups wallets into cohorts without requiring explicit transaction links.
        </p>
      </div>

      {/* Wallet Behaviour Cohorts Section */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Wallet Behaviour Cohorts ({clusters.length})
            </h3>
            {wc?.status === "active" && (
              <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                Clustered using {wc.method ?? "spectral graph embeddings"} + DBSCAN across {wc.wallets_embedded ?? 0} wallets (eps: {wc.eps ?? "auto"}, min samples: {wc.min_samples ?? 3}).
              </p>
            )}
          </div>

          {/* Wallet Search Box */}
          {clusters.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchWallet}
                onChange={(e) => setSearchWallet(e.target.value)}
                placeholder="Find wallet in cohorts..."
                className="rounded-sm border px-2.5 py-1 text-xs outline-none transition-colors focus:border-amber-500 w-48 md:w-56"
                style={{
                  borderColor: "var(--border-hair)",
                  background: "var(--bg-inset)",
                  color: "var(--text-primary)",
                }}
              />
              {searchWallet && (
                <button
                  type="button"
                  onClick={() => setSearchWallet("")}
                  className="text-xs hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Skipped or Inactive Status */}
        {!wc || wc.status !== "active" ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            {wc?.reason ?? "Wallet clustering was skipped for this batch (requires at least 8 wallets to compute meaningful density clusters)."}
          </div>
        ) : clusters.length === 0 ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            No dense behavioural clusters formed with the current density threshold. All wallets exhibited unique, dispersed activity patterns.
          </div>
        ) : (
          <>
            {filteredClusters.length === 0 && searchWallet && (
              <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
                No cohort found containing wallet &ldquo;{searchWallet}&rdquo;.
              </div>
            )}

            {/* Cohort Cards Grid */}
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 lg:grid-cols-3">
              {filteredClusters.map((c) => {
                const isSender = (c.profile?.tx_as_input ?? 0) > 0.5;
                const isReceiver = (c.profile?.tx_as_output ?? 0) > 0.5;
                const hasPattern = (c.profile?.pattern_share ?? 0) > 0;

                return (
                  <div
                    key={c.cluster_id}
                    className="rounded-sm border p-3.5 transition-all"
                    style={{
                      borderColor: selectedCohort === c.cluster_id ? "var(--accent-teal)" : "var(--border-hair)",
                      background: "var(--bg-panel)",
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="data text-xs font-bold" style={{ color: "var(--accent-teal)" }}>
                          Cohort {c.cluster_id}
                        </span>
                        {hasPattern ? (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: "var(--accent-red-soft)", color: "var(--accent-red)" }}>
                            Mix/Peel Active
                          </span>
                        ) : isSender ? (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: "var(--accent-copper-soft)", color: "var(--accent-copper)" }}>
                            Sender Hub
                          </span>
                        ) : isReceiver ? (
                          <span className="rounded px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wider" style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)" }}>
                            Receiver / Payee
                          </span>
                        ) : null}
                      </div>

                      <span className="text-[11px] rounded px-1.5 py-0.5" style={{ background: "var(--bg-inset)", color: "var(--text-secondary)" }}>
                        {c.size} wallets
                      </span>
                    </div>

                    {/* Behavioral Profile Metrics */}
                    <div className="mt-3 flex flex-col gap-1.5 border-t pt-2.5" style={{ borderColor: "var(--border-hair-soft)" }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        Cohort Behavioral Profile
                      </div>
                      {Object.entries(c.profile ?? {}).map(([k, v]) => {
                        const valNum = typeof v === "number" ? v : parseFloat(String(v));
                        const formatted = !isNaN(valNum) ? valNum.toFixed(2) : String(v ?? "—");
                        const label = PROFILE_LABELS[k] ?? k.replace(/_/g, " ");

                        return (
                          <div key={k} className="flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <span>{label}</span>
                            <span className="data font-medium" style={{ color: "var(--text-primary)" }}>
                              {formatted}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {/* Sample Wallets */}
                    <div className="mt-3 flex flex-col gap-1 border-t pt-2.5" style={{ borderColor: "var(--border-hair-soft)" }}>
                      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                        Sample Wallets ({c.sample_wallets?.length ?? 0})
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {(c.sample_wallets ?? []).map((w) => (
                          <span
                            key={w}
                            className="data rounded-sm px-1.5 py-0.5 text-[10px] cursor-pointer hover:border-teal-500"
                            style={{ background: "var(--bg-inset)", color: "var(--text-muted)", border: "1px solid transparent" }}
                            title={w}
                            onClick={() => setSelectedCohort(c.cluster_id)}
                          >
                            {truncateId(w, 6, 4)}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Outliers Section */}
            {(wc.outlier_count ?? outliers.length) > 0 && (
              <div className="mt-4 rounded-sm border p-3.5" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold" style={{ color: "var(--accent-copper)" }}>
                      ⚠ Outlier Wallets ({wc.outlier_count ?? outliers.length})
                    </span>
                    <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                      Wallets with unique/aberrant behavior that did not fit any common cohort.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowOutliers((v) => !v)}
                    className="text-xs font-medium underline decoration-dotted transition-colors hover:text-white"
                    style={{ color: "var(--accent-copper)" }}
                  >
                    {showOutliers ? "Hide Outlier Wallets" : "View Outlier Wallets"}
                  </button>
                </div>

                {showOutliers && (
                  <div className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5" style={{ borderColor: "var(--border-hair-soft)" }}>
                    {outliers.map((w) => (
                      <span
                        key={w}
                        className="data rounded px-2 py-0.5 text-[11px]"
                        style={{ background: "var(--bg-panel)", color: "var(--text-primary)", border: "1px solid var(--border-hair)" }}
                        title={w}
                      >
                        {w}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </section>

      {/* Neo4j & Graph Data Science (GDS) Stage */}
      <section className="mb-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Neo4j &amp; Graph Data Science (GDS) Stage
          </h3>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Runs enterprise graph algorithms (PageRank centrality and Weakly Connected Components) to identify the most structurally influential transaction and wallet hubs.
          </p>
        </div>

        {!graphAnalytics ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            Neo4j sync was not requested for this run.
          </div>
        ) : !graphAnalytics.available ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            💡 {graphAnalytics.reason ?? "Neo4j / GDS not reachable — running with the high-performance in-memory NetworkX graph."}
          </div>
        ) : graphAnalytics.error ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--accent-red)", background: "var(--bg-panel)", color: "var(--accent-red)" }}>
            GDS stage error: {graphAnalytics.error}
          </div>
        ) : (
          <>
            <p className="mb-3 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Executed {graphAnalytics.algorithms_run?.join(", ")} via Neo4j GDS:{" "}
              <strong>{graphAnalytics.component_count ?? 0}</strong> network components, <strong>{graphAnalytics.nodes_scored ?? 0}</strong> nodes scored by centrality.
            </p>

            {(graphAnalytics.top_entities_by_pagerank ?? []).length === 0 ? (
              <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
                No entities were scored in this run.
              </div>
            ) : (
              <div className="rounded-sm border" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
                <div className="flex items-center justify-between border-b px-3 py-2 text-[11px] font-semibold uppercase tracking-wider" style={{ borderColor: "var(--border-hair)", color: "var(--text-muted)" }}>
                  <span>Node Identifier</span>
                  <span>Type</span>
                  <span>Centrality Score (PageRank)</span>
                </div>
                {(graphAnalytics.top_entities_by_pagerank ?? []).map((n) => (
                  <div key={n.id} className="flex items-center justify-between border-b px-3 py-2 text-xs last:border-b-0" style={{ borderColor: "var(--border-hair-soft)" }}>
                    <span className="data font-medium" style={{ color: "var(--text-primary)" }}>
                      {truncateId(n.id, 10, 4)}
                    </span>
                    <span className="rounded px-1.5 py-0.5 text-[10px]" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                      {n.kind}
                    </span>
                    <span className="data font-semibold" style={{ color: "var(--accent-copper)" }}>
                      {typeof n.pagerank === "number" ? n.pagerank.toFixed(3) : String(n.pagerank)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </section>
    </div>
  );
}
