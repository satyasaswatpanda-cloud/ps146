"use client";

import { useState, useMemo } from "react";
import type { EntitiesBlock, NetworkBridge } from "@/types/api";
import { formatBTC, formatPercent, truncateId, formatEpoch } from "@/lib/format";

function EntityCard({ entity }: { entity: EntitiesBlock["entities"][number] }) {
  const [expanded, setExpanded] = useState(false);
  const wallets = entity.wallets || [];
  const displayWallets = expanded ? wallets : wallets.slice(0, 6);

  return (
    <div
      className="flex flex-col gap-2.5 rounded-sm border p-4 transition-all"
      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="data text-xs font-bold" style={{ color: "var(--accent-teal)" }}>
            {entity.entity_id}
          </span>
          <span className="text-[10px] rounded px-1.5 py-0.5" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
            Cluster
          </span>
        </div>
        <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {entity.wallet_count} wallets · {entity.transactions} txs
        </span>
      </div>

      {/* Heuristic Tags */}
      <div className="flex flex-wrap gap-1">
        {(entity.heuristics || []).map((h) => (
          <span
            key={h}
            className="rounded-sm px-1.5 py-0.5 text-[10px] font-medium"
            style={{ background: "var(--accent-blue-soft)", color: "var(--accent-blue)" }}
          >
            {h} heuristic
          </span>
        ))}
      </div>

      {/* Financial Volume */}
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]" style={{ color: "var(--text-secondary)" }}>
        <span>
          <strong className="text-white/80">Received:</strong> {formatBTC(entity.total_received ?? 0)}
        </span>
        <span>
          <strong className="text-white/80">Sent:</strong> {formatBTC(entity.total_sent ?? 0)}
        </span>
      </div>

      {/* Network Origin Attribution */}
      {entity.network_origin && (
        <div className="rounded border px-2.5 py-1.5 text-[11px]" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
          <div className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Candidate Network Origin
          </div>
          <div className="flex flex-wrap items-center gap-1.5" style={{ color: "var(--text-secondary)" }}>
            <span className="data font-medium" style={{ color: "var(--accent-blue)" }}>
              {entity.network_origin.src_ip}
            </span>
            <span>→</span>
            <span>{entity.network_origin.country ?? "Unknown Geo"}</span>
            <span>→</span>
            <span>{entity.network_origin.asn ?? "Unknown ASN"}</span>
            <span className="text-[10px] rounded px-1 py-0.2 ml-1" style={{ background: "var(--bg-panel)", color: "var(--text-muted)" }}>
              {formatPercent(entity.network_origin.relay_share ?? 1)} relay share
            </span>
          </div>
        </div>
      )}

      {/* Active Time Span */}
      {(entity.first_seen || entity.last_seen) && (
        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Active: {formatEpoch(entity.first_seen)} → {formatEpoch(entity.last_seen)}
        </div>
      )}

      {/* Associated Wallets */}
      <div className="border-t pt-2" style={{ borderColor: "var(--border-hair-soft)" }}>
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-[10px] font-medium uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Associated Wallets ({wallets.length})
          </span>
          {wallets.length > 6 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-[10px] underline decoration-dotted transition-colors hover:text-white"
              style={{ color: "var(--accent-teal)" }}
            >
              {expanded ? "Show fewer" : `View all ${wallets.length}`}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1">
          {displayWallets.map((w) => (
            <span
              key={w}
              className="data rounded-sm px-1.5 py-0.5 text-[10px]"
              style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}
              title={w}
            >
              {truncateId(w, 6, 4)}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function BridgeCard({ bridge }: { bridge: NetworkBridge }) {
  return (
    <div
      className="flex flex-col gap-2 rounded-sm border p-3.5 text-xs"
      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="data font-semibold text-sm" style={{ color: "var(--accent-copper)" }}>
            {bridge.src_ip}
          </span>
          <span className="text-[11px] rounded px-1.5 py-0.5" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
            {bridge.geo_country ?? "—"} · {bridge.asn ?? "—"}
          </span>
        </div>
        <span
          className="rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider"
          style={{ background: "var(--accent-copper-soft)", color: "var(--accent-copper)" }}
        >
          {bridge.linked_actors} Linked Entities
        </span>
      </div>

      {bridge.note && (
        <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          {bridge.note}
        </p>
      )}

      {bridge.sample_txids && bridge.sample_txids.length > 0 && (
        <div className="border-t pt-2" style={{ borderColor: "var(--border-hair-soft)" }}>
          <div className="text-[10px] font-medium uppercase tracking-wider mb-1" style={{ color: "var(--text-muted)" }}>
            Sample Bridging Transactions
          </div>
          <div className="flex flex-wrap gap-1">
            {bridge.sample_txids.map((tx) => (
              <span
                key={tx}
                className="data rounded-sm px-1.5 py-0.5 text-[10px]"
                style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}
                title={tx}
              >
                {truncateId(tx, 8, 4)}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function EntitiesPanel({
  entities,
  bridges,
}: {
  entities: EntitiesBlock;
  bridges: NetworkBridge[];
}) {
  const [searchQuery, setSearchQuery] = useState("");

  const entityList = useMemo(() => entities?.entities ?? [], [entities]);
  const bridgeList = useMemo(() => bridges ?? [], [bridges]);
  const summary = useMemo(
    () => entities?.summary ?? { wallets: 0, multi_wallet_entities: 0, largest_entity: 0 },
    [entities]
  );

  // Filter entities by query
  const filteredEntities = useMemo(() => {
    if (!searchQuery.trim()) return entityList;
    const q = searchQuery.trim().toLowerCase();
    return entityList.filter((e) => {
      const matchId = e.entity_id?.toLowerCase().includes(q);
      const matchIp = e.network_origin?.src_ip?.toLowerCase().includes(q);
      const matchWallet = e.wallets?.some((w) => w.toLowerCase().includes(q));
      return matchId || matchIp || matchWallet;
    });
  }, [entityList, searchQuery]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 custom-scrollbar">
      {/* Header Banner */}
      <div className="rounded-sm border p-4" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Entity Attribution &amp; Network Bridges
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          A single real-world actor often controls multiple Bitcoin wallets. By correlating <strong>common-input spending</strong>, <strong>peeling-change continuity</strong>, and <strong>shared IP relay telemetry</strong>, ANTARDRISHTI resolves disparate addresses into single consolidated entity profiles.
        </p>
      </div>

      {/* Multi-Wallet Entities Section */}
      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              Resolved Multi-Wallet Entities ({summary.multi_wallet_entities} of {summary.wallets} wallets)
            </h3>
            <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
              Clustered via Union-Find algorithm over multi-input and peeling-change heuristics.
              {summary.largest_entity > 1 && ` Largest entity spans ${summary.largest_entity} wallets.`}
            </p>
          </div>

          {/* Search bar */}
          {entityList.length > 0 && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search entity, wallet, IP..."
                className="rounded-sm border px-2.5 py-1 text-xs outline-none transition-colors focus:border-amber-500 w-48 md:w-56"
                style={{
                  borderColor: "var(--border-hair)",
                  background: "var(--bg-inset)",
                  color: "var(--text-primary)",
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="text-xs hover:underline"
                  style={{ color: "var(--text-muted)" }}
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Empty state when 0 multi-wallet entities exist */}
        {entityList.length === 0 ? (
          <div
            className="flex flex-col gap-2 rounded-sm border p-4 text-xs leading-relaxed"
            style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-secondary)" }}
          >
            <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--text-primary)" }}>
              <span>ℹ</span>
              <span>No Multi-Input Co-Spending or Peeling Change Links in this Batch</span>
            </div>
            <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              All <strong>{summary.wallets}</strong> wallets in this transaction capture operated independently with single-address inputs.
            </p>
            <div className="mt-1 rounded border p-2.5 text-[11px]" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}>
              <div className="font-semibold text-white/80 mb-1">How Entity Resolution Operates:</div>
              <ul className="flex flex-col gap-1 list-disc pl-4" style={{ color: "var(--text-muted)" }}>
                <li>
                  <strong className="text-white/70">Common-Input Ownership:</strong> When a transaction spends coins from multiple input addresses simultaneously, private keys must co-exist, proving common ownership.
                </li>
                <li>
                  <strong className="text-white/70">Peeling-Change Continuity:</strong> When funds hop along a detected peeling chain, the recurring change outputs are unified into the same controlling entity.
                </li>
              </ul>
            </div>
          </div>
        ) : (
          <>
            {filteredEntities.length === 0 && searchQuery && (
              <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
                No entity found matching &ldquo;{searchQuery}&rdquo;.
              </div>
            )}
            <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2">
              {filteredEntities.map((e) => (
                <EntityCard key={e.entity_id} entity={e} />
              ))}
            </div>
          </>
        )}
      </section>

      {/* Network Bridges Section */}
      <section className="mb-4">
        <div className="mb-2">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Network Bridges ({bridgeList.length})
          </h3>
          <p className="text-[11px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Network-layer IPs observed broadcasting transactions on behalf of two or more otherwise separate wallet entities — revealing hidden infrastructure links where the blockchain ledger appears isolated.
          </p>
        </div>

        {bridgeList.length === 0 ? (
          <div className="rounded-sm border p-4 text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            No shared-relay bridges found in this batch. No single broadcast IP was observed relaying transactions for multiple unlinked entities.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {bridgeList.map((b, i) => (
              <BridgeCard key={i} bridge={b} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
