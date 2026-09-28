"use client";

import { useMemo, useState } from "react";
import { useAnalysis } from "@/hooks/useAnalysis";
import { attachAlertToCase } from "@/lib/api";
import type { Alert, CytoNodeData } from "@/types/api";

import UploadPanel from "@/components/UploadPanel";
import SummaryHero from "@/components/SummaryHero";
import StatusRail from "@/components/StatusRail";
import AlertsList from "@/components/AlertsList";
import AlertDetail from "@/components/AlertDetail";
import NodeDetail from "@/components/NodeDetail";
import InvestigationGraph from "@/components/InvestigationGraph";
import PatternsPanel from "@/components/PatternsPanel";
import EntitiesPanel from "@/components/EntitiesPanel";
import WalletClustersPanel from "@/components/WalletClustersPanel";
import CasesPanel from "@/components/CasesPanel";
import IngestReportBadge from "@/components/IngestReportBadge";
import ActiveCaseSelector from "@/components/ActiveCaseSelector";

const TABS = ["overview", "investigation", "patterns", "entities", "clusters", "cases"] as const;
type Tab = (typeof TABS)[number];

const TAB_LABEL: Record<Tab, string> = {
  overview: "Overview",
  investigation: "Investigation",
  patterns: "Patterns & Flows",
  entities: "Entities",
  clusters: "Wallet Clusters",
  cases: "Cases",
};

const TAB_DESC: Record<Tab, string> = {
  overview: "Summary metrics & radar",
  investigation: "Alerts & interactive graph",
  patterns: "Peeling chains & mixer flows",
  entities: "Multi-wallet attribution",
  clusters: "Behavioural clusters & GDS",
  cases: "Case records & PDF dossiers",
};

export default function Home() {
  const { result, loading, error, sourceLabel, loadSample, loadFile, clearAnalysis } = useAnalysis();
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedAlertId, setSelectedAlertId] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<CytoNodeData | null>(null);
  const [inspectorMode, setInspectorMode] = useState<"alert" | "node">("alert");
  const [showLeftAlerts, setShowLeftAlerts] = useState(true);
  const [showRightInspector, setShowRightInspector] = useState(true);
  const [activeCaseId, setActiveCaseId] = useState<number | null>(null);
  const [attachMessage, setAttachMessage] = useState<string | null>(null);
  const [caseRefreshToken, setCaseRefreshToken] = useState(0);

  const handleClear = () => {
    clearAnalysis();
    setSelectedAlertId(null);
    setSelectedNode(null);
    setTab("overview");
  };

  const handleLoadFile = (file: File) => {
    setSelectedAlertId(null);
    setSelectedNode(null);
    loadFile(file);
  };

  const handleLoadSample = () => {
    setSelectedAlertId(null);
    setSelectedNode(null);
    loadSample();
  };

  const selectedAlert = useMemo(
    () => result?.alerts.find((a) => a.id === selectedAlertId) ?? null,
    [result, selectedAlertId]
  );

  async function handleAttach(alert: Alert) {
    if (!activeCaseId) {
      setAttachMessage("Pick or create an active case at the top right first.");
      return;
    }
    await attachAlertToCase(activeCaseId, {
      alert_id: alert.id,
      txid: alert.txid,
      src_ip: alert.src_ip,
      score: alert.score,
      confidence: alert.confidence,
      reasons: alert.reasons,
      geo_country: alert.geo_country,
      asn: alert.asn,
    });
    setAttachMessage(`Added ${alert.id} to case #${activeCaseId}.`);
    setCaseRefreshToken((t) => t + 1);
  }

  return (
    <div className="flex h-screen" style={{ background: "var(--bg-canvas)" }}>
      {/* Left rail */}
      <nav
        className="flex w-64 shrink-0 flex-col gap-1 border-r px-3 py-5"
        style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
      >
        <div className="mb-6 px-2">
          <div className="text-sm font-semibold tracking-tight" style={{ color: "var(--text-primary)" }}>
            ANTARDRISHTI
          </div>
          <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Network-Blockchain Investigation
          </div>
        </div>
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className="group rounded-sm px-3 py-2 text-left transition-colors"
            style={{
              background: tab === t ? "var(--bg-panel-raised)" : "transparent",
              color: tab === t ? "var(--text-primary)" : "var(--text-secondary)",
              borderLeft: tab === t ? "2px solid var(--accent-copper)" : "2px solid transparent",
            }}
          >
            <div className="text-sm font-medium leading-tight">{TAB_LABEL[t]}</div>
            <div className="text-[10px] mt-0.5" style={{ color: "var(--text-muted)" }}>
              {TAB_DESC[t]}
            </div>
          </button>
        ))}
        <div className="mt-auto px-2 pt-4">
          <StatusRail />
        </div>
      </nav>

      {/* Main content */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="flex items-center justify-between gap-4 border-b px-6 py-3"
          style={{ borderColor: "var(--border-hair)" }}
        >
          <div className="flex items-center gap-3 flex-wrap">
            {result?.ingest_report && <IngestReportBadge report={result.ingest_report} />}
            {sourceLabel && (
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono text-[var(--accent-teal)] px-2 py-0.5 rounded border border-[var(--border-hair)] bg-[var(--bg-inset)] truncate max-w-xs" title={sourceLabel}>
                  Dataset: {sourceLabel}
                </span>
                <button
                  type="button"
                  onClick={handleClear}
                  className="rounded px-2 py-0.5 text-[11px] border border-[var(--border-hair)] hover:bg-white/10 text-[var(--accent-copper)] font-medium"
                  title="Unload active dataset and switch to another capture"
                >
                  ✕ Unload / Switch Dataset
                </button>
              </div>
            )}
            {error && (
              <span className="text-xs font-semibold px-2 py-0.5 rounded bg-red-950/70 text-red-400 border border-red-800/40">
                ⚠ Ingestion Error: {error}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            {attachMessage && (
              <span className="text-[11px]" style={{ color: "var(--accent-teal)" }}>
                {attachMessage}
              </span>
            )}
            <ActiveCaseSelector activeCaseId={activeCaseId} onChange={setActiveCaseId} refreshToken={caseRefreshToken} />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-hidden">
          {!result && tab !== "cases" ? (
            <div className="flex h-full flex-col items-center justify-center overflow-y-auto p-6 md:p-10">
              <div className="w-full max-w-2xl flex flex-col gap-6">
                {/* Welcome Card */}
                <div
                  className="rounded-sm border p-6 text-left"
                  style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
                >
                  <div className="flex flex-wrap items-center gap-2 mb-3">
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-semibold tracking-wider uppercase"
                      style={{ background: "var(--accent-copper-soft)", color: "var(--accent-copper)" }}
                    >
                      AI Network-Blockchain Investigation Platform
                    </span>
                    <span
                      className="rounded px-2 py-0.5 text-[10px] font-medium"
                      style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)" }}
                    >
                      100% Offline & Private
                    </span>
                  </div>

                  <h1 className="text-xl md:text-2xl font-bold tracking-tight mb-2" style={{ color: "var(--text-primary)" }}>
                    Welcome to ANTARDRISHTI
                  </h1>
                  <p className="text-xs md:text-sm leading-relaxed mb-6" style={{ color: "var(--text-secondary)" }}>
                    Designed for investigators to monitor, correlate, and analyze Bitcoin peer-to-peer network traffic and blockchain ledger activity — detecting obfuscation, mixing flows, and money laundering patterns completely offline.
                  </p>

                  {/* 3 Step Guide */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
                    <div className="rounded border p-3" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--accent-copper)" }}>
                        1. Load Data
                      </div>
                      <div className="text-[11px] leading-normal" style={{ color: "var(--text-muted)" }}>
                        Click &ldquo;Quick Demo&rdquo; below or upload a network capture file.
                      </div>
                    </div>
                    <div className="rounded border p-3" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--accent-teal)" }}>
                        2. AI & Graph Analysis
                      </div>
                      <div className="text-[11px] leading-normal" style={{ color: "var(--text-muted)" }}>
                        Explore anomalous transactions, TreeSHAP scores, and link graphs.
                      </div>
                    </div>
                    <div className="rounded border p-3" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                      <div className="text-xs font-semibold mb-1" style={{ color: "var(--accent-blue)" }}>
                        3. Build Cases
                      </div>
                      <div className="text-[11px] leading-normal" style={{ color: "var(--text-muted)" }}>
                        Attach alerts to cases and export auditable PDF &amp; JSON dossiers.
                      </div>
                    </div>
                  </div>

                  {/* Quick Action Button */}
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={loading}
                      onClick={loadSample}
                      className="rounded-sm px-4 py-2.5 text-xs font-semibold shadow-md transition-all hover:brightness-110 disabled:opacity-50 flex items-center gap-2"
                      style={{ background: "var(--accent-copper)", color: "#1a1206" }}
                    >
                      <span>⚡ Run Quick Demo (Bundled Sample)</span>
                    </button>
                    <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                      or choose your own capture file below:
                    </span>
                  </div>
                </div>

                {/* Upload Panel */}
                <UploadPanel
                  onLoadSample={handleLoadSample}
                  onLoadFile={handleLoadFile}
                  onClearAnalysis={handleClear}
                  loading={loading}
                  error={error}
                  sourceLabel={sourceLabel}
                />
              </div>
            </div>
          ) : (
            <>
              {tab === "overview" && result && (
                <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 custom-scrollbar">
                  {/* Hero Forensic Metrics */}
                  <SummaryHero
                    summary={result.summary}
                    patterns={result.patterns}
                    entities={result.entities}
                    walletClusters={result.wallet_clusters}
                    bridges={result.network_bridges}
                    onNavigateTab={(t) => setTab(t)}
                  />

                  {/* Middleware & Capture Pipeline Controls Grid */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Forensic Pipeline Audit & Engine Status Card */}
                    <div className="rounded-sm border p-4 flex flex-col justify-between" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
                      <div>
                        <div className="flex items-center justify-between">
                          <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                            Pipeline Architecture & Ingest Health
                          </h2>
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-800/40">
                            Offline Engine Active
                          </span>
                        </div>
                        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                          Vectorized parser ingests raw blockchain & P2P network telemetry locally, running supervised gradient-boosted trees, unsupervised isolation trees, and graph traversal.
                        </p>

                        <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-3">
                          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Ingest Engine</span>
                            <span className="font-semibold truncate block" style={{ color: "var(--text-primary)" }}>
                              {result.ingest_report?.engine || "Polars Vectorized"}
                            </span>
                          </div>
                          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Records Validated</span>
                            <span className="font-semibold data" style={{ color: "var(--accent-teal)" }}>
                              {result.ingest_report?.rows_accepted ?? result.summary.records} / {result.ingest_report?.rows_read ?? result.summary.records}
                            </span>
                          </div>
                          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
                            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Graph Storage</span>
                            <span className="font-semibold truncate block" style={{ color: result.neo4j_sync?.synced ? "var(--accent-teal)" : "var(--accent-copper)" }}>
                              {result.neo4j_sync?.synced ? "Neo4j GDS" : "NetworkX In-Mem"}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Quick Tab Jump Bar */}
                      <div className="mt-4 pt-3 border-t flex flex-wrap items-center gap-1.5" style={{ borderColor: "var(--border-hair-soft)" }}>
                        <span className="text-[10px] font-mono uppercase mr-1" style={{ color: "var(--text-muted)" }}>Modules:</span>
                        <button
                          type="button"
                          onClick={() => setTab("investigation")}
                          className="px-2.5 py-1 text-xs rounded border transition-colors hover:brightness-125"
                          style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--accent-red)" }}
                        >
                          🚨 Investigation ({result.alerts.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab("patterns")}
                          className="px-2.5 py-1 text-xs rounded border transition-colors hover:brightness-125"
                          style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--accent-copper)" }}
                        >
                          ⛓️ Patterns ({result.patterns.peeling_chains.length + result.patterns.mixing_events.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab("entities")}
                          className="px-2.5 py-1 text-xs rounded border transition-colors hover:brightness-125"
                          style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--accent-teal)" }}
                        >
                          👤 Entities ({result.entities.entities.length})
                        </button>
                        <button
                          type="button"
                          onClick={() => setTab("clusters")}
                          className="px-2.5 py-1 text-xs rounded border transition-colors hover:brightness-125"
                          style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "#c084fc" }}
                        >
                          🧠 Clusters ({result.wallet_clusters.clusters.length})
                        </button>
                      </div>
                    </div>

                    {/* Active Upload & Capture Ingest Panel */}
                    <UploadPanel
                      onLoadSample={handleLoadSample}
                      onLoadFile={handleLoadFile}
                      onClearAnalysis={handleClear}
                      loading={loading}
                      error={error}
                      sourceLabel={sourceLabel}
                      maxUploadMb={undefined}
                    />
                  </div>

                  {/* Visual Previews Grid */}
                  <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                    {/* Left: Investigation Graph Preview Card */}
                    <div className="rounded-sm border overflow-hidden flex flex-col" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
                      <div className="flex items-center justify-between border-b px-4 py-2 text-xs" style={{ borderColor: "var(--border-hair-soft)" }}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            Network & Blockchain Graph Topology
                          </span>
                          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                            ({result.graph.nodes} nodes · {result.graph.edges} edges)
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTab("investigation")}
                          className="text-[11px] font-medium transition-colors hover:underline"
                          style={{ color: "var(--accent-copper)" }}
                        >
                          Full Interactive Canvas →
                        </button>
                      </div>
                      <div className="h-96 relative">
                        <InvestigationGraph
                          graph={result.graph}
                          onSelectNode={(n) => {
                            setSelectedNode(n);
                            setTab("investigation");
                          }}
                          compact={true}
                        />
                      </div>
                    </div>

                    {/* Right: High-Priority Alerts Preview Card */}
                    <div className="rounded-sm border overflow-hidden flex flex-col" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
                      <div className="flex items-center justify-between border-b px-4 py-2 text-xs" style={{ borderColor: "var(--border-hair-soft)" }}>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            Priority Forensic Alerts
                          </span>
                          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>
                            (Showing top {Math.min(8, result.alerts.length)} of {result.alerts.length})
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTab("investigation")}
                          className="text-[11px] font-medium transition-colors hover:underline"
                          style={{ color: "var(--accent-red)" }}
                        >
                          View All {result.alerts.length} in Queue →
                        </button>
                      </div>
                      <div className="h-96 overflow-hidden">
                        <AlertsList
                          alerts={result.alerts.slice(0, 8)}
                          selectedId={selectedAlertId}
                          onSelect={(id) => {
                            setSelectedAlertId(id);
                            setTab("investigation");
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {tab === "investigation" && result && (
                <div className="flex h-full w-full overflow-hidden relative">
                  {/* Left Column: Alerts List (Collapsible) */}
                  {showLeftAlerts && (
                    <div
                      className="w-72 shrink-0 h-full min-h-0 border-r flex flex-col"
                      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
                    >
                      <div className="flex items-center justify-between px-3 py-2 border-b text-xs font-semibold" style={{ borderColor: "var(--border-hair-soft)", color: "var(--text-primary)" }}>
                        <span>Alerts Queue ({result.alerts.length})</span>
                        <button
                          type="button"
                          onClick={() => setShowLeftAlerts(false)}
                          className="text-[11px] px-1.5 py-0.5 rounded hover:bg-white/10"
                          style={{ color: "var(--text-muted)" }}
                          title="Collapse alerts list"
                        >
                          ◀
                        </button>
                      </div>
                      <div className="flex-1 min-h-0 overflow-hidden">
                        <AlertsList
                          alerts={result.alerts}
                          selectedId={selectedAlertId}
                          onSelect={(id) => {
                            setSelectedAlertId(id);
                            setInspectorMode("alert");
                            const matchAlert = result.alerts.find((a) => a.id === id);
                            if (matchAlert?.txid) {
                              const matchingNode = result.graph.elements.nodes.find((n) => n.data.id === matchAlert.txid);
                              if (matchingNode) setSelectedNode(matchingNode.data);
                            }
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Center Column: Graph Canvas */}
                  <div className="flex-1 min-h-0 min-w-0 h-full relative flex flex-col">
                    {/* Floating Sidepanel Toggle Controls */}
                    <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 pointer-events-auto">
                      {!showLeftAlerts && (
                        <button
                          type="button"
                          onClick={() => setShowLeftAlerts(true)}
                          className="rounded border px-2 py-1 text-[11px] font-medium shadow-md transition-colors backdrop-blur-md hover:brightness-125 flex items-center gap-1"
                          style={{
                            borderColor: "var(--border-hair)",
                            background: "rgba(18, 23, 34, 0.9)",
                            color: "var(--text-secondary)",
                          }}
                          title="Expand alerts queue"
                        >
                          <span>▶ Alerts ({result.alerts.length})</span>
                        </button>
                      )}
                    </div>

                    <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 pointer-events-auto">
                      {!showRightInspector && (
                        <button
                          type="button"
                          onClick={() => setShowRightInspector(true)}
                          className="rounded border px-2 py-1 text-[11px] font-medium shadow-md transition-colors backdrop-blur-md hover:brightness-125 flex items-center gap-1"
                          style={{
                            borderColor: "var(--border-hair)",
                            background: "rgba(18, 23, 34, 0.9)",
                            color: "var(--accent-copper)",
                          }}
                          title="Expand evidence inspector"
                        >
                          <span>◀ Inspector {selectedAlert ? `(${selectedAlert.id})` : selectedNode ? `(${selectedNode.kind})` : ""}</span>
                        </button>
                      )}
                    </div>

                    <InvestigationGraph
                      graph={result.graph}
                      onSelectNode={(n) => {
                        setSelectedNode(n);
                        setInspectorMode("node");
                        if (n.alert_id) {
                          setSelectedAlertId(n.alert_id);
                        } else {
                          const match = result.alerts.find((a) => a.txid === n.id);
                          if (match) setSelectedAlertId(match.id);
                        }
                      }}
                      selectedNodeId={selectedNode?.id ?? selectedAlert?.txid}
                      compact={false}
                    />
                  </div>

                  {/* Right Column: Evidence & Node Inspector (Collapsible) */}
                  {showRightInspector && (
                    <div
                      className="w-96 shrink-0 h-full min-h-0 border-l flex flex-col"
                      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
                    >
                      {/* Inspector Header with Tab Switcher if both alert and node exist */}
                      <div className="flex items-center justify-between border-b px-3 py-1.5 text-xs" style={{ borderColor: "var(--border-hair-soft)" }}>
                        {selectedAlert && selectedNode ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => setInspectorMode("alert")}
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{
                                background: inspectorMode === "alert" ? "var(--bg-inset)" : "transparent",
                                color: inspectorMode === "alert" ? "var(--accent-copper)" : "var(--text-muted)",
                                border: "1px solid",
                                borderColor: inspectorMode === "alert" ? "var(--border-hair)" : "transparent",
                              }}
                            >
                              Alert: {selectedAlert.id}
                            </button>
                            <button
                              type="button"
                              onClick={() => setInspectorMode("node")}
                              className="px-2 py-1 rounded text-xs font-medium transition-colors"
                              style={{
                                background: inspectorMode === "node" ? "var(--bg-inset)" : "transparent",
                                color: inspectorMode === "node" ? "var(--accent-teal)" : "var(--text-muted)",
                                border: "1px solid",
                                borderColor: inspectorMode === "node" ? "var(--border-hair)" : "transparent",
                              }}
                            >
                              Node: {selectedNode.kind}
                            </button>
                          </div>
                        ) : (
                          <span className="font-semibold" style={{ color: "var(--text-primary)" }}>
                            {selectedAlert ? "Alert Dossier" : selectedNode ? "Graph Node Detail" : "Forensic Inspector"}
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={() => setShowRightInspector(false)}
                          className="text-[11px] px-1.5 py-0.5 rounded hover:bg-white/10"
                          style={{ color: "var(--text-muted)" }}
                          title="Collapse inspector"
                        >
                          ▶
                        </button>
                      </div>

                      {/* Inspector Content */}
                      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar">
                        {selectedAlert && (inspectorMode === "alert" || !selectedNode) ? (
                          <AlertDetail
                            alert={selectedAlert}
                            onAttachToCase={handleAttach}
                            onFocusGraph={(txid) => {
                              const n = result.graph.elements.nodes.find((x) => x.data.id === txid);
                              if (n) setSelectedNode(n.data);
                            }}
                          />
                        ) : selectedNode ? (
                          <NodeDetail
                            node={selectedNode}
                            onSelectAlert={(alertId) => {
                              setSelectedAlertId(alertId);
                              setInspectorMode("alert");
                            }}
                            onSelectNeighbor={(nid) => {
                              const n = result.graph.elements.nodes.find((x) => x.data.id === nid);
                              if (n) setSelectedNode(n.data);
                            }}
                            onFocusNode={(nid) => {
                              const n = result.graph.elements.nodes.find((x) => x.data.id === nid);
                              if (n) setSelectedNode(n.data);
                            }}
                          />
                        ) : (
                          <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs" style={{ color: "var(--text-muted)" }}>
                            <span className="text-2xl mb-2">🔍</span>
                            <span className="font-semibold text-sm" style={{ color: "var(--text-primary)" }}>
                              No Evidence Selected
                            </span>
                            <p className="mt-1 text-xs max-w-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                              Select an anomaly from the left alerts queue or click any transaction, wallet, or IP node on the graph to inspect forensic evidence.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === "patterns" && result && <PatternsPanel patterns={result.patterns} mixingFlows={result.mixing_flows} />}
              {tab === "entities" && result && <EntitiesPanel entities={result.entities} bridges={result.network_bridges} />}
              {tab === "clusters" && result && <WalletClustersPanel wc={result.wallet_clusters} graphAnalytics={result.graph_analytics} />}
              {tab === "cases" && <CasesPanel />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
