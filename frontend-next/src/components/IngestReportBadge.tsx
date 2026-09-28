"use client";

import type { IngestReport } from "@/types/api";

export default function IngestReportBadge({ report }: { report: IngestReport }) {
  const rejected = report.rows_rejected > 0;
  return (
    <div
      className="flex items-center gap-3 rounded-sm border px-3 py-2 text-[11px]"
      style={{
        borderColor: rejected ? "var(--accent-copper)" : "var(--border-hair)",
        color: "var(--text-muted)",
      }}
    >
      <span className="data" style={{ color: "var(--text-secondary)" }}>
        {report.engine}
      </span>
      <span>{report.format.toUpperCase()}</span>
      <span>
        {report.rows_accepted}/{report.rows_read} rows accepted
      </span>
      {rejected && (
        <span style={{ color: "var(--accent-copper)" }}>{report.rows_rejected} rejected</span>
      )}
    </div>
  );
}
