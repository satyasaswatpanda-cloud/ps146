"use client";

import { useEffect, useRef, useState, useMemo, useCallback } from "react";
import type { Core, ElementDefinition, NodeSingular, EdgeSingular } from "cytoscape";
import type { GraphSummary, CytoNodeData } from "@/types/api";

const KIND_META: Record<
  string,
  { label: string; color: string; shape: "diamond" | "round-rectangle" | "hexagon" | "octagon" | "ellipse" | "triangle" }
> = {
  transaction: { label: "Transaction", color: "#f59e0b", shape: "diamond" },
  wallet: { label: "Wallet", color: "#14b8a6", shape: "round-rectangle" },
  ip: { label: "Source IP", color: "#3b82f6", shape: "hexagon" },
  peer: { label: "Peer IP", color: "#6366f1", shape: "hexagon" },
  asn: { label: "ASN / ISP", color: "#06b6d4", shape: "octagon" },
  country: { label: "Country", color: "#a855f7", shape: "ellipse" },
  port: { label: "Port", color: "#eab308", shape: "triangle" },
};

// Global in-memory layout cache to eliminate re-computation lag across tab switches
const layoutPositionsCache = new Map<string, Record<string, { x: number; y: number }>>();

export default function InvestigationGraph({
  graph,
  onSelectNode,
  selectedNodeId,
  compact = false,
}: {
  graph: GraphSummary;
  onSelectNode?: (node: CytoNodeData) => void;
  selectedNodeId?: string;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const [filterType, setFilterType] = useState<"all" | "flagged" | "blockchain" | "network">("all");
  const [showLabels, setShowLabels] = useState(!compact);
  const [activeLayout, setActiveLayout] = useState<"force" | "concentric" | "circle">("force");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchFeedback, setSearchFeedback] = useState<string | null>(null);

  // Graph cache key based on node count and top node id
  const cacheKey = useMemo(() => {
    const firstId = graph.elements.nodes[0]?.data.id ?? "";
    return `${graph.nodes}_${graph.edges}_${firstId}`;
  }, [graph]);

  // Compute elements with formatted labels and shapes
  const allElements = useMemo(() => {
    const nodes: ElementDefinition[] = graph.elements.nodes.map((n) => {
      const d = n.data;
      const k = d.kind || "unknown";
      let shortLabel = d.label || d.id;
      if (k === "transaction") shortLabel = "tx:" + (d.id.length > 8 ? d.id.slice(0, 6) : d.id);
      else if (k === "wallet") shortLabel = "w:" + (d.id.length > 8 ? d.id.slice(0, 6) : d.id);
      else if (shortLabel.length > 12) shortLabel = shortLabel.slice(0, 10) + "..";

      return {
        data: {
          ...d,
          displayLabel: shortLabel,
          nodeColor: KIND_META[k]?.color ?? "#94a3b8",
          nodeShape: KIND_META[k]?.shape ?? "ellipse",
          isBlockchain: k === "transaction" || k === "wallet",
          isNetwork: k === "ip" || k === "peer" || k === "asn" || k === "country" || k === "port",
        },
      };
    });

    const edges: ElementDefinition[] = graph.elements.edges.map((e) => ({
      data: { ...e.data },
    }));

    return [...nodes, ...edges];
  }, [graph]);

  // Initialize Cytoscape
  useEffect(() => {
    let cancelled = false;

    async function mount() {
      const cytoscape = (await import("cytoscape")).default;
      if (cancelled || !containerRef.current) return;

      const cachedPos = layoutPositionsCache.get(cacheKey);

      const cy = cytoscape({
        container: containerRef.current,
        elements: allElements,
        textureOnViewport: true,
        pixelRatio: "auto",
        motionBlur: false,
        wheelSensitivity: 0.25,
        style: [
          {
            selector: "node",
            style: {
              "background-color": "data(nodeColor)",
              shape: "data(nodeShape)" as never,
              width: (el: NodeSingular) => {
                const deg = (el.data("degree") as number) || 1;
                return Math.max(18, Math.min(38, 16 + deg * 1.3));
              },
              height: (el: NodeSingular) => {
                const deg = (el.data("degree") as number) || 1;
                return Math.max(18, Math.min(38, 16 + deg * 1.3));
              },
              "border-width": (el: NodeSingular) => (el.data("is_flagged") ? 4 : 1),
              "border-color": (el: NodeSingular) => (el.data("is_flagged") ? "#ef4444" : "#1e293b"),
              "border-opacity": 0.95,
              label: showLabels ? "data(displayLabel)" : "",
              color: "#f8fafc",
              "font-size": "9px",
              "font-family": "ui-monospace, monospace",
              "text-valign": "bottom",
              "text-margin-y": 4,
              "text-background-color": "#0b0e14",
              "text-background-opacity": 0.85,
              "text-background-padding": "2px",
              "text-background-shape": "roundrectangle",
            },
          },
          {
            selector: "edge",
            style: {
              width: 1.2,
              "line-color": "#334155",
              "target-arrow-color": "#334155",
              "target-arrow-shape": "triangle",
              "arrow-scale": 0.65,
              "curve-style": "bezier",
              opacity: 0.65,
            },
          },
          {
            selector: "node:selected",
            style: {
              "border-width": 4,
              "border-color": "#ffffff",
              "border-opacity": 1,
            },
          },
          {
            selector: ".dimmed",
            style: {
              opacity: 0.12,
            },
          },
          {
            selector: ".highlighted-edge",
            style: {
              width: 2.8,
              "line-color": "#c9863b",
              "target-arrow-color": "#c9863b",
              opacity: 1,
              "z-index": 999,
            },
          },
          {
            selector: ".highlighted-node",
            style: {
              "border-width": 3,
              "border-color": "#c9863b",
              opacity: 1,
            },
          },
        ],
      });

      // Layout positioning
      if (cachedPos && Object.keys(cachedPos).length > 0) {
        cy.nodes().each((node) => {
          const p = cachedPos[node.id()];
          if (p) node.position(p);
        });
        cy.fit(undefined, 25);
      } else {
        // Fast optimized layout
        const layoutConfig =
          activeLayout === "concentric"
            ? {
                name: "concentric",
                animate: false,
                concentric: (node: NodeSingular) => (node.data("is_flagged") ? 10 : node.data("degree") || 1),
                levelWidth: () => 2,
                fit: true,
                padding: 30,
              }
            : activeLayout === "circle"
            ? {
                name: "circle",
                animate: false,
                fit: true,
                padding: 30,
              }
            : {
                name: "cose",
                animate: false,
                fit: true,
                padding: 30,
                randomize: false,
                nodeRepulsion: () => 4500,
                idealEdgeLength: () => 45,
                edgeElasticity: () => 0.45,
                nestingFactor: 0.1,
                gravity: 0.25,
                numIter: 160,
                initialTemp: 180,
                coolingFactor: 0.95,
                minTemp: 1.0,
              };

        const l = cy.layout(layoutConfig as never);
        l.one("layoutstop", () => {
          // Cache positions
          const positions: Record<string, { x: number; y: number }> = {};
          cy.nodes().forEach((n) => {
            positions[n.id()] = { ...n.position() };
          });
          layoutPositionsCache.set(cacheKey, positions);
        });
        l.run();
      }

      // Interactive hover highlighting
      cy.on("mouseover", "node", (evt) => {
        const node = evt.target as NodeSingular;
        const neighborhood = node.neighborhood().add(node);

        cy.elements().addClass("dimmed");
        neighborhood.removeClass("dimmed");
        node.connectedEdges().addClass("highlighted-edge");
      });

      cy.on("mouseout", "node", () => {
        cy.elements().removeClass("dimmed");
        cy.edges().removeClass("highlighted-edge");
      });

      // Tap event
      cy.on("tap", "node", (evt) => {
        const d = evt.target.data() as CytoNodeData;
        onSelectNode?.(d);
      });

      cyRef.current = cy;
    }

    mount();

    return () => {
      cancelled = true;
      cyRef.current?.destroy();
      cyRef.current = null;
    };
  }, [allElements, cacheKey, showLabels, activeLayout, onSelectNode]);

  // Apply visual filtering (Flagged, Blockchain, Network)
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.batch(() => {
      if (filterType === "all") {
        cy.elements().style("display", "element");
      } else if (filterType === "flagged") {
        cy.nodes().forEach((n) => {
          const show = !!n.data("is_flagged");
          n.style("display", show ? "element" : "none");
        });
        cy.edges().forEach((e) => {
          const srcShow = !!e.source().data("is_flagged");
          const tgtShow = !!e.target().data("is_flagged");
          e.style("display", srcShow && tgtShow ? "element" : "none");
        });
      } else if (filterType === "blockchain") {
        cy.nodes().forEach((n) => {
          const show = !!n.data("isBlockchain");
          n.style("display", show ? "element" : "none");
        });
        cy.edges().forEach((e) => {
          const srcShow = !!e.source().data("isBlockchain");
          const tgtShow = !!e.target().data("isBlockchain");
          e.style("display", srcShow && tgtShow ? "element" : "none");
        });
      } else if (filterType === "network") {
        cy.nodes().forEach((n) => {
          const show = !!n.data("isNetwork");
          n.style("display", show ? "element" : "none");
        });
        cy.edges().forEach((e) => {
          const srcShow = !!e.source().data("isNetwork");
          const tgtShow = !!e.target().data("isNetwork");
          e.style("display", srcShow && tgtShow ? "element" : "none");
        });
      }
    });
  }, [filterType]);

  // Sync selectedNodeId highlight & auto-center
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;

    cy.nodes().unselect();
    if (selectedNodeId) {
      const target = cy.getElementById(selectedNodeId);
      if (target.length > 0) {
        target.select();
        cy.animate({
          center: { eles: target },
          zoom: Math.max(cy.zoom(), 1.6),
          duration: 350,
        });
      }
    }
  }, [selectedNodeId]);

  // Controls
  const handleZoomIn = useCallback(() => {
    cyRef.current?.zoom({ level: cyRef.current.zoom() * 1.3, renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } });
  }, []);

  const handleZoomOut = useCallback(() => {
    cyRef.current?.zoom({ level: cyRef.current.zoom() * 0.75, renderedPosition: { x: cyRef.current.width() / 2, y: cyRef.current.height() / 2 } });
  }, []);

  const handleFit = useCallback(() => {
    cyRef.current?.animate({ fit: { eles: cyRef.current.elements(":visible"), padding: 25 }, duration: 250 });
  }, []);

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      const cy = cyRef.current;
      if (!cy || !searchQuery.trim()) return;

      const q = searchQuery.trim().toLowerCase();
      const match = cy.nodes().filter((n) => {
        const id = (n.data("id") as string)?.toLowerCase() || "";
        const label = (n.data("label") as string)?.toLowerCase() || "";
        return id.includes(q) || label.includes(q);
      });

      if (match.length > 0) {
        const first = match.first();
        cy.nodes().unselect();
        first.select();
        cy.animate({
          center: { eles: first },
          zoom: 2.2,
          duration: 350,
        });
        onSelectNode?.(first.data() as CytoNodeData);
        setSearchFeedback(`Found ${match.length} matching node(s)`);
      } else {
        setSearchFeedback("No matching node found");
      }
      setTimeout(() => setSearchFeedback(null), 3000);
    },
    [searchQuery, onSelectNode]
  );

  return (
    <div className="relative h-full w-full flex flex-col select-none overflow-hidden" style={{ background: "var(--bg-inset)" }}>
      {/* Top Toolbar (Available on full investigation view) */}
      {!compact && (
        <div
          className="z-10 flex flex-wrap items-center justify-between gap-2 border-b px-3 py-1.5 text-xs backdrop-blur-sm"
          style={{ borderColor: "var(--border-hair-soft)", background: "rgba(18, 23, 34, 0.85)" }}
        >
          {/* Search Bar */}
          <form onSubmit={handleSearch} className="flex items-center gap-1.5">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search wallet, txid, IP..."
              className="rounded-sm border px-2 py-1 text-[11px] outline-none transition-colors focus:border-amber-500 w-44 md:w-52"
              style={{
                borderColor: "var(--border-hair)",
                background: "var(--bg-inset)",
                color: "var(--text-primary)",
              }}
            />
            <button
              type="submit"
              className="rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
            >
              Focus
            </button>
            {searchFeedback && (
              <span className="text-[10px] ml-1" style={{ color: searchFeedback.includes("No") ? "var(--accent-red)" : "var(--accent-teal)" }}>
                {searchFeedback}
              </span>
            )}
          </form>

          {/* Filters & Layout Controls */}
          <div className="flex items-center gap-2">
            {/* Filter Pills */}
            <div className="flex rounded border p-0.5" style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)" }}>
              <button
                type="button"
                onClick={() => setFilterType("all")}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                style={{
                  background: filterType === "all" ? "var(--bg-panel-raised)" : "transparent",
                  color: filterType === "all" ? "var(--text-primary)" : "var(--text-muted)",
                }}
              >
                All ({graph.elements.nodes.length})
              </button>
              <button
                type="button"
                onClick={() => setFilterType("flagged")}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                style={{
                  background: filterType === "flagged" ? "var(--accent-red-soft)" : "transparent",
                  color: filterType === "flagged" ? "var(--accent-red)" : "var(--text-muted)",
                }}
              >
                ⚠ Flagged
              </button>
              <button
                type="button"
                onClick={() => setFilterType("blockchain")}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                style={{
                  background: filterType === "blockchain" ? "var(--accent-teal-soft)" : "transparent",
                  color: filterType === "blockchain" ? "var(--accent-teal)" : "var(--text-muted)",
                }}
              >
                Blockchain
              </button>
              <button
                type="button"
                onClick={() => setFilterType("network")}
                className="rounded px-2 py-0.5 text-[10px] font-medium transition-colors"
                style={{
                  background: filterType === "network" ? "var(--accent-blue-soft)" : "transparent",
                  color: filterType === "network" ? "var(--accent-blue)" : "var(--text-muted)",
                }}
              >
                Network
              </button>
            </div>

            {/* Layout Switcher */}
            <select
              value={activeLayout}
              onChange={(e) => setActiveLayout(e.target.value as "force" | "concentric" | "circle")}
              className="rounded-sm border px-2 py-1 text-[11px] outline-none cursor-pointer"
              style={{
                borderColor: "var(--border-hair)",
                background: "var(--bg-inset)",
                color: "var(--text-secondary)",
              }}
              title="Change graph layout mode"
            >
              <option value="force">Force Directed (Organic)</option>
              <option value="concentric">Concentric (Hubs in center)</option>
              <option value="circle">Circular</option>
            </select>

            {/* Label Toggle */}
            <button
              type="button"
              onClick={() => setShowLabels((v) => !v)}
              className="rounded-sm border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-white/5"
              style={{
                borderColor: "var(--border-hair)",
                background: showLabels ? "var(--accent-copper-soft)" : "transparent",
                color: showLabels ? "var(--accent-copper)" : "var(--text-muted)",
              }}
              title="Toggle node labels"
            >
              {showLabels ? "Labels ON" : "Labels OFF"}
            </button>

            {/* Zoom / Fit Buttons */}
            <div className="flex items-center gap-1 border-l pl-2" style={{ borderColor: "var(--border-hair)" }}>
              <button
                type="button"
                onClick={handleZoomIn}
                className="rounded border h-6 w-6 flex items-center justify-center text-xs font-bold transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
                title="Zoom in"
              >
                +
              </button>
              <button
                type="button"
                onClick={handleZoomOut}
                className="rounded border h-6 w-6 flex items-center justify-center text-xs font-bold transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
                title="Zoom out"
              >
                -
              </button>
              <button
                type="button"
                onClick={handleFit}
                className="rounded border px-2 h-6 flex items-center justify-center text-[10px] font-semibold transition-colors hover:bg-white/5"
                style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
                title="Fit all nodes to view"
              >
                Fit
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Canvas Area */}
      <div className="relative flex-1 min-h-0 w-full">
        <div ref={containerRef} className="h-full w-full" />

        {/* Truncated notice */}
        {graph.truncated && (
          <div
            className="absolute right-3 top-3 z-10 rounded-sm px-2.5 py-1 text-[11px] shadow"
            style={{ background: "var(--accent-copper-soft)", color: "var(--accent-copper)", border: "1px solid var(--accent-copper)" }}
          >
            Showing {graph.exported_nodes} of {graph.nodes} nodes (filtered for performance)
          </div>
        )}
      </div>

      {/* Definable Interactive Legend */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-t px-3 py-1.5 text-[11px]"
        style={{ borderColor: "var(--border-hair-soft)", background: "rgba(18, 23, 34, 0.95)" }}
      >
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
            Legend:
          </span>
          <div className="flex items-center gap-1.5" title="Transactions (Diamond)">
            <span className="h-2.5 w-2.5 rotate-45" style={{ background: KIND_META.transaction.color }} />
            <span style={{ color: "var(--text-secondary)" }}>Transaction</span>
          </div>
          <div className="flex items-center gap-1.5" title="Wallets / Bitcoin Addresses (Round Rect)">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_META.wallet.color }} />
            <span style={{ color: "var(--text-secondary)" }}>Wallet</span>
          </div>
          <div className="flex items-center gap-1.5" title="Source / Relay IP Address (Hexagon)">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META.ip.color }} />
            <span style={{ color: "var(--text-secondary)" }}>IP Relay</span>
          </div>
          <div className="flex items-center gap-1.5" title="Peer IP (Hexagon)">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META.peer.color }} />
            <span style={{ color: "var(--text-secondary)" }}>Peer</span>
          </div>
          <div className="flex items-center gap-1.5" title="Autonomous System / ISP (Octagon)">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ background: KIND_META.asn.color }} />
            <span style={{ color: "var(--text-secondary)" }}>ASN</span>
          </div>
          <div className="flex items-center gap-1.5" title="Geolocation Country (Ellipse)">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: KIND_META.country.color }} />
            <span style={{ color: "var(--text-secondary)" }}>Country</span>
          </div>
          <div className="flex items-center gap-1.5" title="High Risk Anomaly Alert">
            <span className="h-2.5 w-2.5 rounded-full border-2" style={{ borderColor: "#ef4444", background: "rgba(239,68,68,0.3)" }} />
            <span className="font-semibold" style={{ color: "#ef4444" }}>Flagged Alert</span>
          </div>
        </div>

        <div className="text-[10px]" style={{ color: "var(--text-muted)" }}>
          Hover node to spotlight links · Click to inspect dossier
        </div>
      </div>
    </div>
  );
}
