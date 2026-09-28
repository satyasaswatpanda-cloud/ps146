"use client";

import { useState, useMemo } from "react";
import type { PatternsBlock, MixingFlow, PeelingChain, MixingEvent } from "@/types/api";
import { formatBTC, formatPercent, truncateId } from "@/lib/format";

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
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition-colors hover:brightness-125"
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

function ChainCard({ chain }: { chain: PeelingChain }) {
  const [showChanges, setShowChanges] = useState(false);
  const scoreNum = typeof chain.score === "number" ? chain.score : 0;
  const isHighRisk = scoreNum >= 0.7;
  const dominantIp = chain.network?.dominant_ip || "Unknown";
  const dominantIpShare = chain.network?.dominant_ip_share ?? 0;

  return (
    <div
      className="rounded-sm border p-4 transition-all hover:border-[var(--border-strong)]"
      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--border-hair-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="data text-xs font-bold px-2 py-0.5 rounded" style={{ background: "rgba(217, 119, 6, 0.15)", color: "var(--accent-copper)" }}>
            {chain.chain_id}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            Peeling Chain ({chain.length} Consecutive Hops)
          </span>
          {chain.single_relay_origin && (
            <span
              className="text-[10px] px-2 py-0.5 rounded font-mono font-semibold"
              style={{ background: "rgba(220, 38, 38, 0.15)", color: "#f87171", border: "1px solid rgba(220, 38, 38, 0.3)" }}
              title="Transactions in this chain were primarily broadcast from the same relay IP node"
            >
              Single-Relay Origin
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-mono px-2 py-0.5 rounded"
            style={{
              background: isHighRisk ? "rgba(239, 68, 68, 0.15)" : "var(--bg-inset)",
              color: isHighRisk ? "#f87171" : "var(--text-secondary)",
              border: "1px solid var(--border-hair)",
            }}
          >
            Suspicion Score: {scoreNum.toFixed(2)}
          </span>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Start Value</span>
          <span className="data font-semibold" style={{ color: "var(--text-primary)" }}>{formatBTC(chain.start_value ?? 0)}</span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Total Peeled</span>
          <span className="data font-semibold" style={{ color: "var(--accent-copper)" }}>{formatBTC(chain.peeled_total ?? 0)}</span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Final Change Remainder</span>
          <span className="data font-semibold" style={{ color: "var(--text-secondary)" }}>{formatBTC(chain.final_change ?? 0)}</span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Dominant Relay IP</span>
          <span className="data font-mono font-medium truncate block" style={{ color: "var(--accent-teal)" }} title={dominantIp}>
            {dominantIp} ({formatPercent(dominantIpShare)})
          </span>
        </div>
      </div>

      {/* Flow Pipeline of TXIDs */}
      <div className="mt-3">
        <span className="block text-[11px] font-mono mb-1.5" style={{ color: "var(--text-muted)" }}>
          Transaction Pipeline ({chain.txids.length} txs):
        </span>
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1.5 custom-scrollbar">
          {chain.txids.map((tx, i) => (
            <div key={tx} className="flex items-center gap-1.5 shrink-0">
              <div
                className="group relative flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px]"
                style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
              >
                <span className="data font-mono" title={tx}>
                  {truncateId(tx, 6, 4)}
                </span>
                <CopyButton text={tx} label="copy" />
              </div>
              {i < chain.txids.length - 1 && (
                <span className="text-xs font-bold" style={{ color: "var(--accent-copper)" }}>→</span>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Change Addresses Traceability Toggle */}
      {chain.change_addresses && chain.change_addresses.length > 0 && (
        <div className="mt-3 pt-2 border-t" style={{ borderColor: "var(--border-hair-soft)" }}>
          <button
            type="button"
            onClick={() => setShowChanges(!showChanges)}
            className="flex items-center gap-2 text-xs font-mono transition-colors hover:brightness-125"
            style={{ color: "var(--accent-teal)" }}
          >
            <span>{showChanges ? "▼ Hide" : "▶ Trace"} Change Address Continuity ({chain.change_addresses.length} addresses)</span>
          </button>

          {showChanges && (
            <div className="mt-2.5 flex flex-col gap-1.5 rounded p-2.5 border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair)" }}>
              <span className="text-[10px] font-mono" style={{ color: "var(--text-muted)" }}>
                Each hop transfers the unspent remainder to a fresh change address before being consumed in the next transaction:
              </span>
              <div className="flex flex-col gap-1 mt-1">
                {chain.change_addresses.map((addr, idx) => (
                  <div key={idx} className="flex items-center gap-2 text-[11px]">
                    <span className="font-mono text-[10px] w-14 shrink-0" style={{ color: "var(--text-muted)" }}>
                      Hop {idx + 1}:
                    </span>
                    <span className="data font-mono text-[11px] truncate" style={{ color: "var(--text-primary)" }}>
                      {addr}
                    </span>
                    <CopyButton text={addr} label="copy" />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Forensic Rationale */}
      <p className="mt-3 rounded p-2 text-[11px] leading-relaxed border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair-soft)", color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>Forensic Heuristic:</strong> {chain.reason}
        {chain.median_gap_seconds != null && (
          <span className="ml-1 font-mono" style={{ color: "var(--text-muted)" }}>
            (Median broadcast interval: {chain.median_gap_seconds}s)
          </span>
        )}
      </p>
    </div>
  );
}

function MixingEventCard({ event }: { event: MixingEvent }) {
  const scoreNum = typeof event.score === "number" ? event.score : 0;
  const isHighRisk = scoreNum >= 0.7;

  return (
    <div
      className="rounded-sm border p-4 transition-all hover:border-[var(--border-strong)]"
      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--border-hair-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="data text-xs font-bold px-2 py-0.5 rounded" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#c084fc" }}>
            {event.mix_id || "MIX"}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            Equal-Output CoinJoin Mixing Event
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span
            className="text-[11px] font-mono px-2 py-0.5 rounded"
            style={{
              background: isHighRisk ? "rgba(239, 68, 68, 0.15)" : "var(--bg-inset)",
              color: isHighRisk ? "#f87171" : "var(--text-secondary)",
              border: "1px solid var(--border-hair)",
            }}
          >
            Suspicion Score: {scoreNum.toFixed(2)}
          </span>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 text-xs">
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Inputs / Outputs</span>
          <span className="data font-semibold" style={{ color: "var(--text-primary)" }}>
            {event.inputs} in → {event.outputs} out
          </span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Equal Denomination</span>
          <span className="data font-semibold" style={{ color: "#c084fc" }}>
            {formatBTC(event.equal_output_value ?? 0)}
          </span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Uniform Output Count</span>
          <span className="data font-semibold" style={{ color: "var(--text-primary)" }}>
            {event.equal_output_count} of {event.outputs} ({formatPercent(event.outputs ? event.equal_output_count / event.outputs : 0)})
          </span>
        </div>
        <div className="rounded p-2" style={{ background: "var(--bg-inset)" }}>
          <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Broadcast Relay Node</span>
          <span className="data font-mono font-medium truncate block" style={{ color: "var(--accent-teal)" }} title={event.src_ip || "N/A"}>
            {event.src_ip || "Unknown IP"} {event.geo_country ? `(${event.geo_country})` : ""}
          </span>
        </div>
      </div>

      <div className="mt-3 flex items-center gap-2">
        <span className="text-[11px] font-mono shrink-0" style={{ color: "var(--text-muted)" }}>Transaction ID:</span>
        <span className="data font-mono text-[11px] truncate" style={{ color: "var(--text-secondary)" }}>{event.txid}</span>
        <CopyButton text={event.txid} label="copy txid" />
      </div>

      <p className="mt-3 rounded p-2 text-[11px] leading-relaxed border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair-soft)", color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>CoinJoin Signature:</strong> {event.reason}
        {event.asn && <span className="ml-1 font-mono" style={{ color: "var(--text-muted)" }}>· ASN: {event.asn}</span>}
      </p>
    </div>
  );
}

function FlowHopRow({ hop, label, isAlert }: { hop: MixingFlow["pre_mix_sources"][number]; label: string; isAlert?: boolean }) {
  return (
    <div
      className="flex flex-wrap items-center gap-2 rounded px-2.5 py-1.5 text-[11px] border"
      style={{
        background: isAlert ? "rgba(220, 38, 38, 0.1)" : "var(--bg-inset)",
        borderColor: isAlert ? "rgba(220, 38, 38, 0.3)" : "var(--border-hair-soft)",
        color: "var(--text-secondary)",
      }}
    >
      <span className="w-16 shrink-0 font-mono text-[10px] uppercase font-semibold" style={{ color: isAlert ? "#f87171" : "var(--text-muted)" }}>
        {label}
      </span>
      <span className="data font-mono" title={hop.txid}>
        {truncateId(hop.txid, 6, 4)}
      </span>
      <CopyButton text={hop.txid} label="tx" />
      <span style={{ color: "var(--text-muted)" }}>·</span>
      <span className="font-mono" style={{ color: isAlert ? "#f87171" : "var(--accent-teal)" }}>
        {hop.src_ip || "Unknown IP"}
      </span>
      {hop.geo_country && (
        <>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span>{hop.geo_country}</span>
        </>
      )}
      {hop.asn && (
        <>
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span className="font-mono text-[10px]" style={{ color: "var(--text-muted)" }}>{hop.asn}</span>
        </>
      )}
      {isAlert && (
        <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-950 text-red-300 border border-red-800">
          Correlated Relay IP
        </span>
      )}
    </div>
  );
}

function FlowCard({ flow }: { flow: MixingFlow }) {
  const hasDeanonymization = flow.same_relay_before_and_after && flow.same_relay_before_and_after.length > 0;

  return (
    <div
      className="rounded-sm border p-4 transition-all hover:border-[var(--border-strong)]"
      style={{
        borderColor: hasDeanonymization ? "rgba(220, 38, 38, 0.4)" : "var(--border-hair)",
        background: "var(--bg-panel)",
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3" style={{ borderColor: "var(--border-hair-soft)" }}>
        <div className="flex items-center gap-2">
          <span className="data text-xs font-bold px-2 py-0.5 rounded" style={{ background: "rgba(13, 148, 136, 0.15)", color: "var(--accent-teal)" }}>
            {flow.flow_id}
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--text-primary)" }}>
            Tumbler / Mixing Flow Reconstruction
          </span>
        </div>
        <div className="flex items-center gap-2 text-[11px] font-mono" style={{ color: "var(--text-muted)" }}>
          <span>{flow.pre_mix_count} Pre-Mix Inflows</span>
          <span>·</span>
          <span>{flow.post_mix_reach} Post-Mix Reach</span>
        </div>
      </div>

      {/* Critical OPSEC Deanonymization Callout */}
      {hasDeanonymization && (
        <div
          className="mt-3 rounded p-3 border text-xs"
          style={{
            background: "rgba(220, 38, 38, 0.12)",
            borderColor: "rgba(220, 38, 38, 0.4)",
            color: "#fca5a5",
          }}
        >
          <div className="flex items-center gap-2 font-bold text-red-400">
            <span className="text-base">🚨</span>
            <span>OPSEC DEANONYMIZATION DETECTED: Shared Relay IP</span>
          </div>
          <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "#fecaca" }}>
            The actor attempted to break on-chain linkability using a tumbler, but broadcast transactions both <strong>before</strong> and <strong>after</strong> mixing through identical relay IP node(s):{" "}
            <span className="font-mono font-bold underline">{flow.same_relay_before_and_after.join(", ")}</span>.
            This correlation defeats on-chain mixing and establishes identity continuity.
          </p>
        </div>
      )}

      {/* Multistage Lifecycle Flow */}
      <div className="mt-3 flex flex-col gap-2">
        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
          Stage 1: Pre-Mix Inflows ({flow.pre_mix_sources.length})
        </span>
        {flow.pre_mix_sources.map((h, i) => {
          const isCorrelated = flow.same_relay_before_and_after?.includes(h.src_ip);
          return <FlowHopRow key={i} hop={h} label={`pre-mix ${i + 1}`} isAlert={isCorrelated} />;
        })}

        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--text-muted)" }}>
          Stage 2: Tumbler / Equal-Output Mixing Core
        </span>
        <div
          className="flex flex-wrap items-center gap-2 rounded px-2.5 py-2 text-[11px] border"
          style={{ background: "rgba(13, 148, 136, 0.08)", borderColor: "rgba(13, 148, 136, 0.3)", color: "var(--text-primary)" }}
        >
          <span className="w-16 shrink-0 font-mono text-[10px] uppercase font-bold" style={{ color: "var(--accent-teal)" }}>
            Mixer Tx
          </span>
          <span className="data font-mono" title={flow.mixer_txid}>
            {truncateId(flow.mixer_txid, 8, 6)}
          </span>
          <CopyButton text={flow.mixer_txid} label="copy txid" />
          <span style={{ color: "var(--text-muted)" }}>·</span>
          <span className="font-mono" style={{ color: "var(--accent-teal)" }}>Relay IP: {flow.mixer_src_ip || "Unknown"}</span>
        </div>

        <span className="text-[11px] font-mono font-semibold uppercase tracking-wider mt-1" style={{ color: "var(--text-muted)" }}>
          Stage 3: Post-Mix Spend Hops ({flow.post_mix_hops.flat().length})
        </span>
        {flow.post_mix_hops.flat().map((h, i) => {
          const isCorrelated = flow.same_relay_before_and_after?.includes(h.src_ip);
          return <FlowHopRow key={i} hop={h} label={`post-hop ${i + 1}`} isAlert={isCorrelated} />;
        })}
      </div>

      <p className="mt-3 rounded p-2 text-[11px] leading-relaxed border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair-soft)", color: "var(--text-secondary)" }}>
        <strong style={{ color: "var(--text-primary)" }}>Investigative Narrative:</strong> {flow.note}
      </p>
    </div>
  );
}

export default function PatternsPanel({
  patterns,
  mixingFlows = [],
}: {
  patterns: PatternsBlock;
  mixingFlows?: MixingFlow[];
}) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<"all" | "peeling" | "mixing" | "flows">("all");

  const peelingChains = patterns?.peeling_chains ?? [];
  const mixingEvents = patterns?.mixing_events ?? [];
  const flows = mixingFlows ?? [];

  // Filter based on search query
  const query = search.trim().toLowerCase();

  const filteredChains = useMemo(() => {
    if (!query) return peelingChains;
    return peelingChains.filter(
      (c) =>
        c.chain_id.toLowerCase().includes(query) ||
        c.reason?.toLowerCase().includes(query) ||
        c.network?.dominant_ip?.toLowerCase().includes(query) ||
        c.txids.some((tx) => tx.toLowerCase().includes(query)) ||
        c.change_addresses?.some((addr) => addr.toLowerCase().includes(query))
    );
  }, [peelingChains, query]);

  const filteredMixEvents = useMemo(() => {
    if (!query) return mixingEvents;
    return mixingEvents.filter(
      (m) =>
        m.mix_id.toLowerCase().includes(query) ||
        m.txid.toLowerCase().includes(query) ||
        m.reason?.toLowerCase().includes(query) ||
        m.src_ip?.toLowerCase().includes(query) ||
        m.asn?.toLowerCase().includes(query)
    );
  }, [mixingEvents, query]);

  const filteredFlows = useMemo(() => {
    if (!query) return flows;
    return flows.filter(
      (f) =>
        f.flow_id.toLowerCase().includes(query) ||
        f.mixer_txid.toLowerCase().includes(query) ||
        f.mixer_src_ip?.toLowerCase().includes(query) ||
        f.note?.toLowerCase().includes(query) ||
        f.same_relay_before_and_after?.some((ip) => ip.toLowerCase().includes(query)) ||
        f.pre_mix_sources.some((s) => s.txid.toLowerCase().includes(query) || s.src_ip?.toLowerCase().includes(query)) ||
        f.post_mix_hops.flat().some((h) => h.txid.toLowerCase().includes(query) || h.src_ip?.toLowerCase().includes(query))
    );
  }, [flows, query]);

  const totalPatternsCount = peelingChains.length + mixingEvents.length + flows.length;
  const opsecBreachesCount = flows.filter((f) => f.same_relay_before_and_after && f.same_relay_before_and_after.length > 0).length;

  return (
    <div className="flex h-full min-h-0 flex-col gap-5 overflow-y-auto p-5 custom-scrollbar">
      {/* Header and Heuristic Overview Banner */}
      <div className="rounded-sm border p-4" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold tracking-wide" style={{ color: "var(--text-primary)" }}>
              Network & On-Chain Typology Analysis
            </h2>
            <p className="mt-1 text-xs leading-relaxed max-w-3xl" style={{ color: "var(--text-secondary)" }}>
              Detects advanced obfuscation typologies including <strong>peeling chains</strong> (iterative balance peeling via change addresses), <strong>equal-output CoinJoin mixing events</strong>, and multi-hop <strong>tumbler flows</strong> correlated against P2P relay broadcast metadata.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <span className="font-mono text-xs px-2.5 py-1 rounded border" style={{ background: "var(--bg-inset)", borderColor: "var(--border-hair)", color: "var(--accent-copper)" }}>
              {totalPatternsCount} Obfuscation Typologies
            </span>
          </div>
        </div>

        {/* Quick KPI Strip */}
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 border-t pt-3" style={{ borderColor: "var(--border-hair-soft)" }}>
          <div className="rounded p-2.5" style={{ background: "var(--bg-inset)" }}>
            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Peeling Chains</span>
            <span className="text-base font-bold data" style={{ color: "var(--accent-copper)" }}>{peelingChains.length}</span>
            <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>Sequences with change peeling</span>
          </div>
          <div className="rounded p-2.5" style={{ background: "var(--bg-inset)" }}>
            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>CoinJoin Mixers</span>
            <span className="text-base font-bold data" style={{ color: "#c084fc" }}>{mixingEvents.length}</span>
            <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>Equal denomination transactions</span>
          </div>
          <div className="rounded p-2.5" style={{ background: "var(--bg-inset)" }}>
            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>Reconstructed Flows</span>
            <span className="text-base font-bold data" style={{ color: "var(--accent-teal)" }}>{flows.length}</span>
            <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>Multi-hop tumbler traces</span>
          </div>
          <div className="rounded p-2.5" style={{ background: "var(--bg-inset)" }}>
            <span className="block text-[10px] uppercase font-mono" style={{ color: "var(--text-muted)" }}>OPSEC Relay Breaches</span>
            <span className="text-base font-bold data" style={{ color: opsecBreachesCount > 0 ? "#f87171" : "var(--text-muted)" }}>
              {opsecBreachesCount}
            </span>
            <span className="text-[10px] block mt-0.5" style={{ color: "var(--text-muted)" }}>Shared IP pre/post mix</span>
          </div>
        </div>
      </div>

      {/* Search and Category Filter Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 flex-1 min-w-[240px] max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by TXID, Address, Relay IP, or ID (CHN-001, MIX-001)..."
            className="w-full rounded-sm border px-3 py-1.5 text-xs placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent-copper)] transition-colors"
            style={{
              background: "var(--bg-panel)",
              borderColor: "var(--border-hair)",
              color: "var(--text-primary)",
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="text-xs px-2 py-1 rounded hover:brightness-125 font-mono"
              style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}
            >
              Clear
            </button>
          )}
        </div>

        {/* Category Tabs */}
        <div className="flex items-center gap-1 rounded p-1 border" style={{ background: "var(--bg-panel)", borderColor: "var(--border-hair)" }}>
          <button
            type="button"
            onClick={() => setFilterType("all")}
            className="px-2.5 py-1 text-xs rounded transition-colors"
            style={{
              background: filterType === "all" ? "var(--bg-inset)" : "transparent",
              color: filterType === "all" ? "var(--text-primary)" : "var(--text-muted)",
              fontWeight: filterType === "all" ? 600 : 400,
            }}
          >
            All Typologies
          </button>
          <button
            type="button"
            onClick={() => setFilterType("peeling")}
            className="px-2.5 py-1 text-xs rounded transition-colors"
            style={{
              background: filterType === "peeling" ? "var(--bg-inset)" : "transparent",
              color: filterType === "peeling" ? "var(--accent-copper)" : "var(--text-muted)",
              fontWeight: filterType === "peeling" ? 600 : 400,
            }}
          >
            Peeling Chains ({filteredChains.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("mixing")}
            className="px-2.5 py-1 text-xs rounded transition-colors"
            style={{
              background: filterType === "mixing" ? "var(--bg-inset)" : "transparent",
              color: filterType === "mixing" ? "#c084fc" : "var(--text-muted)",
              fontWeight: filterType === "mixing" ? 600 : 400,
            }}
          >
            Equal-Output Mixers ({filteredMixEvents.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterType("flows")}
            className="px-2.5 py-1 text-xs rounded transition-colors"
            style={{
              background: filterType === "flows" ? "var(--bg-inset)" : "transparent",
              color: filterType === "flows" ? "var(--accent-teal)" : "var(--text-muted)",
              fontWeight: filterType === "flows" ? 600 : 400,
            }}
          >
            Tumbler Flows ({filteredFlows.length})
          </button>
        </div>
      </div>

      {/* SECTION 1: Peeling Chains */}
      {(filterType === "all" || filterType === "peeling") && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-hair-soft)" }}>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <span>Peeling Chains</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(217, 119, 6, 0.15)", color: "var(--accent-copper)" }}>
                  {filteredChains.length} detected
                </span>
              </h3>
              <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: "var(--text-muted)" }}>
                A peeling chain continuously peels off payments to different recipients while recycling remaining change to new addresses across sequential hops.
              </p>
            </div>
          </div>

          {filteredChains.length === 0 ? (
            <div className="rounded-sm border p-5 text-center" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
              <div className="max-w-md mx-auto flex flex-col items-center gap-2">
                <span className="text-xl">⛓️</span>
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {query ? `No peeling chains match filter "${query}"` : "No Peeling Chains Identified in this Batch"}
                </span>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {query
                    ? "Try clearing your search query or searching by a different wallet address or transaction ID."
                    : "Peeling chain detection requires at least 3 consecutive 2-output transactions where the larger output feeds into the next transaction while smaller outputs peel off. Standard 1-to-1 or batch fan-out transfers in this capture did not trigger this heuristic."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredChains.map((c) => (
                <ChainCard key={c.chain_id} chain={c} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 2: Equal-Output Mixing Events (Wasabi / Samourai CoinJoin) */}
      {(filterType === "all" || filterType === "mixing") && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-hair-soft)" }}>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <span>Equal-Output CoinJoin Mixing Events</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(139, 92, 246, 0.15)", color: "#c084fc" }}>
                  {filteredMixEvents.length} detected
                </span>
              </h3>
              <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: "var(--text-muted)" }}>
                Transactions exhibiting CoinJoin characteristics: multiple inputs producing uniform, identical-denomination outputs to break input-to-output value correlation.
              </p>
            </div>
          </div>

          {filteredMixEvents.length === 0 ? (
            <div className="rounded-sm border p-5 text-center" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
              <div className="max-w-md mx-auto flex flex-col items-center gap-2">
                <span className="text-xl">🔀</span>
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {query ? `No CoinJoin mixing events match filter "${query}"` : "No Equal-Output Mixing Events Found"}
                </span>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {query
                    ? "Try clearing your search query or searching by a different transaction ID or relay IP."
                    : "Equal-output mixing requires transactions with >= 3 identical output amounts matching CoinJoin pools (e.g. 0.1 BTC, 0.05 BTC) with multiple inputs. Captures without collaborative mixing pools will report zero events here."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredMixEvents.map((m) => (
                <MixingEventCard key={m.mix_id || m.txid} event={m} />
              ))}
            </div>
          )}
        </section>
      )}

      {/* SECTION 3: Multi-Hop Tumbler Flows */}
      {(filterType === "all" || filterType === "flows") && (
        <section className="flex flex-col gap-3">
          <div className="flex items-center justify-between border-b pb-2" style={{ borderColor: "var(--border-hair-soft)" }}>
            <div>
              <h3 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                <span>Mixing & Tumbler Flow Reconstructions</span>
                <span className="font-mono text-xs px-2 py-0.5 rounded" style={{ background: "rgba(13, 148, 136, 0.15)", color: "var(--accent-teal)" }}>
                  {filteredFlows.length} reconstructed
                </span>
              </h3>
              <p className="text-[11px] leading-relaxed mt-0.5" style={{ color: "var(--text-muted)" }}>
                End-to-end fund lifecycle tracing across <strong>pre-mix sources → mixer hub → post-mix withdrawal hops</strong>, correlating P2P network relay signatures to unmask obfuscation.
              </p>
            </div>
          </div>

          {filteredFlows.length === 0 ? (
            <div className="rounded-sm border p-5 text-center" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
              <div className="max-w-md mx-auto flex flex-col items-center gap-2">
                <span className="text-xl">🌪️</span>
                <span className="text-xs font-semibold" style={{ color: "var(--text-primary)" }}>
                  {query ? `No tumbler flows match filter "${query}"` : "No Multi-Hop Tumbler Flows Reconstructed"}
                </span>
                <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                  {query
                    ? "Try clearing your search query or searching by a different relay IP or mixer transaction ID."
                    : "Multi-hop flows correlate pre-mix fund sources through an intermediate mixing transaction to subsequent withdrawal hops. When mixer events are detected, their forward and backward traversal traces will automatically appear here."}
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {filteredFlows.map((f) => (
                <FlowCard key={f.flow_id} flow={f} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

