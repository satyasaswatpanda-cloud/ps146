"use client";

import { useRef, useState } from "react";

export default function UploadPanel({
  onLoadSample,
  onLoadFile,
  onClearAnalysis,
  loading,
  sourceLabel,
  error,
  maxUploadMb,
}: {
  onLoadSample: () => void;
  onLoadFile: (file: File) => void;
  onClearAnalysis?: () => void;
  loading: boolean;
  sourceLabel: string | null;
  error?: string | null;
  maxUploadMb?: number;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function handleFiles(files: FileList | null) {
    const file = files?.[0];
    if (file) {
      if (inputRef.current) inputRef.current.value = "";
      onLoadFile(file);
    }
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-sm border p-4"
      style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragOver(false);
        handleFiles(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            Load Transaction Data
          </h2>
          <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Analyze Bitcoin network and blockchain records offline
          </p>
        </div>
        {sourceLabel && (
          <div className="flex items-center gap-2">
            <span className="data text-xs rounded px-2 py-0.5 truncate max-w-[200px]" style={{ background: "var(--bg-inset)", color: "var(--accent-teal)" }} title={sourceLabel}>
              Active: {sourceLabel}
            </span>
            {onClearAnalysis && (
              <button
                type="button"
                onClick={onClearAnalysis}
                className="text-[11px] px-2 py-0.5 rounded border transition-colors hover:bg-white/10"
                style={{ borderColor: "var(--border-hair)", color: "var(--accent-copper)" }}
                title="Unload active dataset to start clean"
              >
                ✕ Unload Dataset
              </button>
            )}
          </div>
        )}
      </div>

      <div
        className="flex flex-col items-center gap-2.5 rounded-sm border border-dashed px-4 py-6 text-center transition-colors"
        style={{
          borderColor: dragOver ? "var(--accent-teal)" : "var(--border-hair)",
          background: dragOver ? "var(--accent-teal-soft)" : "var(--bg-inset)",
        }}
      >
        <p className="text-xs" style={{ color: "var(--text-secondary)" }}>
          Drop your transaction capture file here (.csv, .xlsx, .json, or .xml)
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          <button
            type="button"
            disabled={loading}
            onClick={onLoadSample}
            className="rounded-sm px-3.5 py-1.5 text-xs font-semibold shadow-sm transition-all hover:brightness-110 disabled:opacity-50"
            style={{ background: "var(--accent-copper)", color: "#1a1206" }}
          >
            ⚡ Run Bundled Sample (Recommended)
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={() => inputRef.current?.click()}
            className="rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors hover:bg-white/5 disabled:opacity-50"
            style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
          >
            📂 Choose File...
          </button>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,.xlsx,.xls,.json,.xml"
          className="hidden"
          onChange={(e) => handleFiles(e.target.files)}
        />
        <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>
          {maxUploadMb ? `Up to ${maxUploadMb} MB · ` : ""}Supports CSV, Excel (.xlsx/.xls), JSON, XML · 100% offline & local execution
        </p>
      </div>

      {error && (
        <div className="rounded p-3 border text-xs flex flex-col gap-1" style={{ background: "rgba(220, 38, 38, 0.12)", borderColor: "rgba(220, 38, 38, 0.35)", color: "#fca5a5" }}>
          <div className="font-semibold text-red-400 flex items-center gap-1.5">
            <span>⚠</span>
            <span>Failed to Ingest File</span>
          </div>
          <p className="text-[11px] leading-relaxed text-red-200">
            {error}
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Ensure your file contains required headers: <span className="font-mono text-gray-300">txid, timestamp, input_addresses, output_addresses, input_amounts, output_amounts, src_ip, dst_ip</span>. Delimit lists with vertical bars (<span className="font-mono text-gray-300">|</span>).
          </p>
        </div>
      )}

      {loading && (
        <div className="flex items-center gap-2 rounded px-3 py-2 text-xs" style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)" }}>
          <span className="inline-block h-2 w-2 animate-ping rounded-full" style={{ background: "var(--accent-teal)" }} />
          <span>Running correlation, anomaly detection & graph analytics pipeline...</span>
        </div>
      )}
    </div>
  );
}

