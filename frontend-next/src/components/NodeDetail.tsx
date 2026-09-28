"use client";

import { useState, useMemo } from "react";
import type { CytoNodeData } from "@/types/api";

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (navigator?.clipboard) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Copy full ID: ${text}`}
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:brightness-125 font-mono"
      style={{
        background: copied ? "rgba(16, 185, 129, 0.2)" : "var(--bg-inset)",
        color: copied ? "#10b981" : "var(--text-muted)",
        border: "1px solid var(--border-hair)",
      }}
    >
      <span>{copied ? "✓ Copied" : label}</span>
    </button>
  );
}

export default function NodeDetail({
  node,
  onSelectAlert,
  onSelectNeighbor,
  onFocusNode,
}: {
  node: CytoNodeData;
  onSelectAlert?: (alertId: string) => void;
  onSelectNeighbor?: (neighborId: string) => void;
  onFocusNode?: (nodeId: string) => void;
}) {
  const [relSearch, setRelSearch] = useState("");

  const filteredRelationships = useMemo(() => {
    const q = relSearch.trim().toLowerCase();
    if (!q) return node.relationships;
    return node.relationships.filter(
      (r) => r.neighbor_id.toLowerCase().includes(q) || r.relation?.toLowerCase().includes(q)
    );
  }, [node.relationships, relSearch]);

  return (
    <div className="flex flex-col gap-4 p-5">
      {/* Node Header */}
      <div>
        <div className="flex items-center justify-between">
          <span
            className="text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded"
            style={{ background: "var(--bg-inset)", color: "var(--text-muted)", border: "1px solid var(--border-hair)" }}
          >
            {node.kind} Node
          </span>
          <span className="text-xs font-mono" style={{ color: "var(--text-secondary)" }}>
            {node.connected_count} connections
          </span>
        </div>

        <div className="mt-2 flex items-center gap-2">
          <h3 className="data break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            {node.label || node.id}
          </h3>
          <CopyButton text={node.id} label="copy" />
        </div>
      </div>

      {/* Flagged Status & Alert Jump */}
      {node.is_flagged && (
        <div
          className="rounded-sm border p-3 flex flex-col gap-2"
          style={{ background: "rgba(220, 38, 38, 0.1)", borderColor: "rgba(220, 38, 38, 0.3)" }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-red-400 flex items-center gap-1.5">
              <span>⚠</span> Flagged High-Risk Transaction
            </span>
            <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-red-950 text-red-300">
              Score: {node.alert_score}
            </span>
          </div>
          {node.alert_id && onSelectAlert && (
            <button
              type="button"
              onClick={() => onSelectAlert(node.alert_id!)}
              className="mt-1 rounded px-2.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:brightness-110 flex items-center justify-center gap-1.5"
              style={{ background: "var(--accent-copper)", color: "#1a1206" }}
            >
              <span>📋 View Alert Dossier & SHAP Factors ({node.alert_id})</span>
            </button>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-2 border-y py-2" style={{ borderColor: "var(--border-hair-soft)" }}>
        {onFocusNode && (
          <button
            type="button"
            onClick={() => onFocusNode(node.id)}
            className="rounded border px-2.5 py-1 text-xs font-medium transition-colors hover:brightness-125 flex items-center gap-1"
            style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--accent-teal)" }}
          >
            <span>🎯 Center in View</span>
          </button>
        )}
        {node.entity_id && (
          <span className="text-[11px] font-mono px-2 py-1 rounded" style={{ background: "var(--bg-inset)", color: "var(--text-secondary)" }}>
            Cluster Entity: {node.entity_id}
          </span>
        )}
      </div>

      {/* Metadata Table */}
      {node.metadata && Object.keys(node.metadata).length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Node Attributes
          </h4>
          <div className="flex flex-col gap-1 rounded border p-2" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
            {Object.entries(node.metadata).map(([k, v]) => (
              <div key={k} className="flex justify-between items-center text-[11px]">
                <span className="font-mono" style={{ color: "var(--text-muted)" }}>{k.replace(/_/g, " ")}:</span>
                <span className="data max-w-[65%] truncate text-right font-medium" style={{ color: "var(--text-secondary)" }} title={String(v)}>
                  {String(v)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Traversible Relationships */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Graph Neighborhood ({node.relationships.length})
          </h4>
          <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
            Click node to traverse
          </span>
        </div>

        {node.relationships.length > 5 && (
          <input
            type="text"
            value={relSearch}
            onChange={(e) => setRelSearch(e.target.value)}
            placeholder="Filter connected nodes..."
            className="w-full rounded border px-2 py-1 text-xs outline-none mb-2"
            style={{
              borderColor: "var(--border-hair)",
              background: "var(--bg-inset)",
              color: "var(--text-primary)",
            }}
          />
        )}

        <div className="flex flex-col gap-1.5 max-h-72 overflow-y-auto custom-scrollbar">
          {filteredRelationships.length === 0 ? (
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              No connected nodes match filter.
            </span>
          ) : (
            filteredRelationships.map((r, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded border p-1.5 text-[11px] transition-colors hover:brightness-110"
                style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}
              >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => onSelectNeighbor?.(r.neighbor_id)}
                    className="data font-mono truncate text-left hover:underline"
                    style={{ color: "var(--accent-teal)" }}
                    title={`Traverse to ${r.neighbor_id}`}
                  >
                    {r.neighbor_id}
                  </button>
                  <CopyButton text={r.neighbor_id} label="copy" />
                </div>
                <span
                  className="font-mono text-[10px] px-1.5 py-0.5 rounded shrink-0 ml-1"
                  style={{ background: "var(--bg-panel)", color: "var(--text-muted)" }}
                >
                  {r.relation}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

