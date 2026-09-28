"use client";

import { useEffect, useState } from "react";
import { createCase, listCases } from "@/lib/api";
import type { CaseRecord } from "@/types/api";

export default function ActiveCaseSelector({
  activeCaseId,
  onChange,
  refreshToken,
}: {
  activeCaseId: number | null;
  onChange: (id: number | null) => void;
  refreshToken?: number;
}) {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    listCases().then(setCases).catch(() => setCases([]));
  }, [refreshToken]);

  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
        active case
      </span>
      <select
        value={activeCaseId ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className="rounded-sm border px-2 py-1 text-xs"
        style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--text-primary)" }}
      >
        <option value="">none selected</option>
        {cases.map((c) => (
          <option key={c.id} value={c.id}>
            #{c.id} {c.title}
          </option>
        ))}
      </select>
      <button
        type="button"
        disabled={creating}
        onClick={async () => {
          const title = window.prompt("New case title");
          if (!title?.trim()) return;
          setCreating(true);
          try {
            const created = await createCase({ title: title.trim() });
            setCases((prev) => [...prev, created]);
            onChange(created.id);
          } finally {
            setCreating(false);
          }
        }}
        className="rounded-sm border px-2 py-1 text-xs"
        style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
      >
        + new
      </button>
    </div>
  );
}
