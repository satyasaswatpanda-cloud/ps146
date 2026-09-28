"use client";

import { useEffect, useState } from "react";
import { fetchStatus } from "@/lib/api";
import type { StatusResponse } from "@/types/api";

function Dot({ on }: { on: boolean }) {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full"
      style={{ background: on ? "var(--accent-teal)" : "var(--text-muted)" }}
    />
  );
}

/** Compact strip of engine-availability pills: what's actually running right now. */
export default function StatusRail() {
  const [status, setStatus] = useState<StatusResponse | null>(null);

  useEffect(() => {
    fetchStatus().then(setStatus).catch(() => setStatus(null));
  }, []);

  if (!status) {
    return <div className="text-xs" style={{ color: "var(--text-muted)" }}>checking engines…</div>;
  }

  const items: { label: string; on: boolean; title: string; desc: string }[] = [
    {
      label: "CatBoost",
      on: status.catboost.available,
      title: "Supervised ML model for refined anomaly ranking",
      desc: "Supervised ML",
    },
    {
      label: "TreeSHAP",
      on: status.shap.available,
      title: "Explains exactly which features made each alert suspicious",
      desc: "Explainability",
    },
    {
      label: "MLflow",
      on: status.mlflow.enabled,
      title: status.mlflow.tracking_uri ?? status.mlflow.reason ?? "Offline experiment & benchmark tracking",
      desc: "Metrics Log",
    },
    {
      label: "Local LLM",
      on: !!status.local_llm.reachable,
      title: status.local_llm.reachable ? "Ollama running: generates grounded natural language case summaries" : "Offline template narratives active (Ollama optional)",
      desc: "Narratives",
    },
    {
      label: "Neo4j",
      on: !!status.neo4j.reachable,
      title: status.neo4j.reachable ? "Neo4j connected for graph exploration" : "In-memory NetworkX active (Neo4j optional)",
      desc: "Graph DB",
    },
    {
      label: "GDS",
      on: status.neo4j.gds.available,
      title: status.neo4j.gds.available ? "Graph Data Science enabled (PageRank + WCC)" : "Graph Data Science algorithms optional",
      desc: "Graph Algo",
    },
  ];

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
        System Engines
      </div>
      <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
        {items.map((it) => (
          <div
            key={it.label}
            className="flex items-center gap-1.5 text-[11px] cursor-help transition-opacity hover:opacity-80"
            title={`${it.label} (${it.desc}): ${it.title}`}
            style={{ color: it.on ? "var(--text-secondary)" : "var(--text-muted)" }}
          >
            <Dot on={it.on} />
            <span className="truncate">{it.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
