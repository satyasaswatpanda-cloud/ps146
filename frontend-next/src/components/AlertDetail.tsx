"use client";

import { useState } from "react";
import type { Alert } from "@/types/api";
import { formatScore, formatPercent, riskLabel } from "@/lib/format";

function ShapBars({ title, subtitle, items }: { title: string; subtitle?: string; items: Alert["shap_explanation"] }) {
  if (!items || items.length === 0) return null;
  const max = Math.max(...items.map((i) => Math.abs(i.shap_value)), 0.001);
  return (
    <div className="rounded-sm border p-3" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
      <div className="flex items-center justify-between mb-1">
        <h4 className="text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
          {title}
        </h4>
        <span className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          SHAP feature impact
        </span>
      </div>
      {subtitle && (
        <p className="text-[10px] mb-2.5" style={{ color: "var(--text-muted)" }}>
          {subtitle}
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        {items.map((it) => {
          const width = Math.max(6, (Math.abs(it.shap_value) / max) * 100);
          const negative = it.shap_value < 0;
          return (
            <div key={it.feature} className="flex items-center gap-2">
              <span className="w-40 shrink-0 truncate text-[11px]" title={it.feature} style={{ color: "var(--text-muted)" }}>
                {it.feature}
              </span>
              <div className="h-2 flex-1 rounded-sm" style={{ background: "var(--bg-panel)" }}>
                <div
                  className="h-2 rounded-sm"
                  style={{
                    width: `${width}%`,
                    background: negative ? "var(--accent-red)" : "var(--accent-teal)",
                  }}
                />
              </div>
              <span className="data w-14 shrink-0 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
                {it.shap_value.toFixed(2)}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-end gap-3 text-[10px]" style={{ color: "var(--text-muted)" }}>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-teal)" }} />
          Reduces risk
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: "var(--accent-red)" }} />
          Increases risk
        </span>
      </div>
    </div>
  );
}

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
      title={`Copy full value: ${text}`}
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

export default function AlertDetail({
  alert,
  onAttachToCase,
  onFocusGraph,
}: {
  alert: Alert;
  onAttachToCase: (alert: Alert) => void;
  onFocusGraph?: (txid: string) => void;
}) {
  const [attaching, setAttaching] = useState(false);
  const [attached, setAttached] = useState(false);
  const risk = riskLabel(alert.score);

  return (
    <div className="flex flex-col gap-5 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="data text-xs flex items-center gap-2" style={{ color: "var(--text-muted)" }}>
            <span className="font-bold text-[var(--accent-copper)]">{alert.id}</span>
            <span className="text-[10px] rounded px-1.5 py-0.2" style={{ background: "var(--bg-inset)" }}>
              Alert Dossier
            </span>
            {alert.entity_id && (
              <span className="text-[10px] rounded px-1.5 py-0.2 font-mono" style={{ background: "rgba(20, 184, 166, 0.15)", color: "var(--accent-teal)" }}>
                Entity: {alert.entity_id}
              </span>
            )}
          </div>
          <div className="mt-1 flex items-center gap-2">
            <h3 className="data break-all text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {alert.txid}
            </h3>
            <CopyButton text={alert.txid} label="copy" />
          </div>
          <div className="mt-1 text-xs flex items-center gap-2 font-mono" style={{ color: "var(--text-muted)" }}>
            <span>Relay IP: {alert.src_ip}</span>
            {alert.geo_country && <span>· Country: {alert.geo_country}</span>}
            {alert.asn && <span>· ASN: {alert.asn}</span>}
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="data text-2xl font-bold" style={{ color: alert.score >= 0.7 ? "var(--accent-red)" : "var(--accent-copper)" }}>
            {formatScore(alert.score)}
          </div>
          <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--text-muted)" }}>
            {risk} · {formatPercent(alert.confidence)} conf
          </div>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-y py-2.5" style={{ borderColor: "var(--border-hair-soft)" }}>
        <button
          type="button"
          disabled={attaching}
          onClick={async () => {
            setAttaching(true);
            try {
              await onAttachToCase(alert);
              setAttached(true);
              setTimeout(() => setAttached(false), 3000);
            } finally {
              setAttaching(false);
            }
          }}
          className="rounded-sm px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:brightness-110 disabled:opacity-50 flex items-center gap-1.5"
          style={{ background: attached ? "#10b981" : "var(--accent-copper)", color: "#1a1206" }}
        >
          <span>{attached ? "✓ Added to Case" : attaching ? "Adding..." : "📁 Attach Alert to Case"}</span>
        </button>

        {onFocusGraph && (
          <button
            type="button"
            onClick={() => onFocusGraph(alert.txid)}
            className="rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors hover:brightness-125 flex items-center gap-1.5"
            style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--accent-teal)" }}
            title="Locate and center this transaction on the interactive graph"
          >
            <span>🎯 Focus on Graph</span>
          </button>
        )}
      </div>

      {alert.narrative && (
        <div className="rounded-sm border p-3.5" style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)" }}>
          <div className="mb-1.5 flex items-center justify-between text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span className="font-medium text-xs" style={{ color: "var(--text-secondary)" }}>
              🤖 AI Investigative Narrative
            </span>
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-medium"
              style={{
                background: alert.narrative.validation.grounded ? "var(--accent-teal-soft)" : "var(--accent-red-soft)",
                color: alert.narrative.validation.grounded ? "var(--accent-teal)" : "var(--accent-red)",
              }}
            >
              {alert.narrative.validation.grounded ? "✓ Fact Grounded" : "⚠ Flagged"}
            </span>
          </div>
          <p className="text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
            {alert.narrative.text}
          </p>
        </div>
      )}

      <div>
        <h4 className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Why this transaction was flagged
        </h4>
        <ul className="flex flex-col gap-1.5">
          {alert.reasons.map((r, i) => (
            <li key={i} className="flex gap-2 text-xs" style={{ color: "var(--text-secondary)" }}>
              <span style={{ color: "var(--accent-copper)" }}>—</span>
              {r}
            </li>
          ))}
        </ul>
      </div>

      {alert.patterns.length > 0 && (
        <div>
          <h4 className="mb-2 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
            Detected Graph Typologies
          </h4>
          <ul className="flex flex-wrap gap-1.5">
            {alert.patterns.map((p, i) => (
              <li
                key={i}
                className="w-fit rounded-sm px-2 py-1 text-[11px] font-medium"
                style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)" }}
              >
                {p}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h4 className="mb-1.5 text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
          Detection Engines Consensus
        </h4>
        <div className="grid grid-cols-3 gap-2.5 text-xs">
          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Isolation Forest</div>
            <div className="data font-semibold mt-0.5" style={{ color: alert.detectors.isolation_forest === "outlier" ? "var(--accent-red)" : "var(--text-primary)" }}>
              {alert.detectors.isolation_forest}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>Unsupervised outlier</div>
          </div>
          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>CatBoost ML</div>
            <div className="data font-semibold mt-0.5" style={{ color: "var(--text-primary)" }}>
              {alert.detectors.catboost !== null ? alert.detectors.catboost.toFixed(3) : "n/a"}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>Supervised score</div>
          </div>
          <div className="rounded p-2 border" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
            <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>Graph Pattern</div>
            <div className="data font-semibold mt-0.5" style={{ color: alert.detectors.graph_pattern ? "var(--accent-copper)" : "var(--text-primary)" }}>
              {alert.detectors.graph_pattern ? "Matched" : "None"}
            </div>
            <div className="text-[9px] mt-0.5" style={{ color: "var(--text-muted)" }}>Network typology</div>
          </div>
        </div>
      </div>

      <ShapBars
        title="Isolation Forest · TreeSHAP Explanation"
        subtitle="Identifies which transaction attributes drove the anomaly classification score."
        items={alert.shap_explanation}
      />
      <ShapBars
        title="CatBoost · Feature Importance"
        subtitle="Shows gradient-boosted decision factors for this alert."
        items={alert.catboost_shap_explanation}
      />

      {alert.network_origin && (
        <div>
          <h4 className="mb-2 text-xs font-medium" style={{ color: "var(--text-secondary)" }}>
            Candidate network origin
          </h4>
          <div className="flex items-center gap-2 text-xs">
            {alert.network_origin.chain.map((link, i) => (
              <div key={link.level} className="flex items-center gap-2">
                {i > 0 && <span style={{ color: "var(--text-muted)" }}>→</span>}
                <span
                  className="data rounded-sm px-2 py-1"
                  style={{ background: "var(--bg-inset)", color: "var(--text-primary)" }}
                >
                  {link.value ?? "—"}
                </span>
              </div>
            ))}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {alert.network_origin.note} Relay share {formatPercent(alert.network_origin.relay_share)} across{" "}
            {alert.network_origin.observations} observations.
          </p>
        </div>
      )}
    </div>
  );
}
