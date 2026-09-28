"use client";

import { useEffect, useState, useCallback } from "react";
import { createCase, deleteCase, getCaseAlerts, listCases, updateCase, caseExportUrl } from "@/lib/api";
import type { CaseAlertAttachment, CaseRecord } from "@/types/api";
import { formatScore, riskLabel, truncateId, formatPercent } from "@/lib/format";

export default function CasesPanel() {
  const [cases, setCases] = useState<CaseRecord[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<number | null>(null);
  const [alerts, setAlerts] = useState<CaseAlertAttachment[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingNote, setEditingNote] = useState<string>("");
  const [savingNote, setSavingNote] = useState(false);

  const refresh = useCallback(() => {
    listCases()
      .then(setCases)
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Load alerts and notes when a case is expanded
  useEffect(() => {
    if (selected === null) {
      setAlerts([]);
      setEditingNote("");
      return;
    }
    const currentCase = cases.find((c) => c.id === selected);
    setEditingNote(currentCase?.analyst_note || currentCase?.description || "");
    getCaseAlerts(selected)
      .then(setAlerts)
      .catch(() => setAlerts([]));
  }, [selected, cases]);

  async function handleStatusChange(caseId: number, newStatus: string) {
    try {
      await updateCase(caseId, { status: newStatus });
      setSuccess(`Case #${caseId} status updated to ${newStatus}`);
      setTimeout(() => setSuccess(null), 3000);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  async function handleSaveNote(caseId: number) {
    setSavingNote(true);
    try {
      await updateCase(caseId, { analyst_note: editingNote, description: editingNote });
      setSuccess("Investigator notes saved to case dossier.");
      setTimeout(() => setSuccess(null), 3000);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSavingNote(false);
    }
  }

  async function handleDeleteCase(caseItem: CaseRecord) {
    const ok = window.confirm(
      `Are you sure you want to permanently delete case #${caseItem.id}: "${caseItem.title}"?\n\nThis will remove all attached alerts and notes.`
    );
    if (!ok) return;

    try {
      await deleteCase(caseItem.id);
      if (selected === caseItem.id) setSelected(null);
      setSuccess(`Case #${caseItem.id} deleted.`);
      setTimeout(() => setSuccess(null), 3000);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-6 overflow-y-auto p-6 custom-scrollbar">
      {/* Header Banner */}
      <div className="rounded-sm border p-4" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)" }}>
        <h2 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          Case Management &amp; Forensic Dossiers
        </h2>
        <p className="mt-1 text-xs leading-relaxed" style={{ color: "var(--text-secondary)" }}>
          Group suspicious alerts, peeling flows, and wallet clusters into auditable legal cases. Write investigator findings and export tamper-evident, multi-page vector <strong>PDF dossiers</strong> or structured <strong>JSON reports</strong> for court and law enforcement records.
        </p>
      </div>

      {/* Notifications */}
      {error && (
        <div className="rounded p-3 text-xs flex items-center justify-between" style={{ background: "var(--accent-red-soft)", color: "var(--accent-red)" }}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} className="font-bold ml-2">✕</button>
        </div>
      )}
      {success && (
        <div className="rounded p-3 text-xs flex items-center justify-between" style={{ background: "var(--accent-teal-soft)", color: "var(--accent-teal)" }}>
          <span>✓ {success}</span>
          <button type="button" onClick={() => setSuccess(null)} className="font-bold ml-2">✕</button>
        </div>
      )}

      {/* Create New Case Form */}
      <section className="rounded-sm border p-4" style={{ borderColor: "var(--border-hair)", background: "var(--bg-panel)" }}>
        <h3 className="text-xs font-semibold uppercase tracking-wider mb-2.5" style={{ color: "var(--text-primary)" }}>
          Create New Investigation Case
        </h3>
        <form
          className="flex flex-col gap-2.5"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!title.trim()) return;
            try {
              const created = await createCase({ title: title.trim(), description: description.trim() });
              setTitle("");
              setDescription("");
              setSelected(created.id);
              setSuccess(`Created Case #${created.id}: ${created.title}`);
              setTimeout(() => setSuccess(null), 3000);
              refresh();
            } catch (err) {
              setError((err as Error).message);
            }
          }}
        >
          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Case title (e.g., Operation DarkPool / Mixer Investigation)"
              className="flex-1 rounded-sm border px-3 py-1.5 text-xs outline-none transition-colors focus:border-amber-500"
              style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--text-primary)" }}
              required
            />
            <button
              type="submit"
              className="rounded-sm px-4 py-1.5 text-xs font-semibold shadow-sm transition-all hover:brightness-110"
              style={{ background: "var(--accent-copper)", color: "#1a1206" }}
            >
              + Create Case
            </button>
          </div>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief scope / suspect description (optional)"
            className="w-full rounded-sm border px-3 py-1.5 text-xs outline-none transition-colors focus:border-amber-500"
            style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--text-primary)" }}
          />
        </form>
      </section>

      {/* Existing Cases List */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
            Investigation Cases ({cases.length})
          </h3>
          <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
            Click case title to view attached alerts and edit notes
          </span>
        </div>

        {cases.length === 0 ? (
          <div className="rounded-sm border p-6 text-center text-xs" style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-panel)", color: "var(--text-muted)" }}>
            No investigation cases created yet. Create a case above or attach an alert from the Investigation tab.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {cases.map((c) => {
              const isSelected = selected === c.id;

              return (
                <div
                  key={c.id}
                  className="rounded-sm border p-4 transition-all"
                  style={{
                    borderColor: isSelected ? "var(--accent-teal)" : "var(--border-hair)",
                    background: "var(--bg-panel)",
                  }}
                >
                  {/* Case Card Header */}
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() => setSelected(isSelected ? null : c.id)}
                        className="text-left font-semibold text-sm transition-colors hover:text-amber-400 flex items-center gap-2"
                        style={{ color: "var(--text-primary)" }}
                      >
                        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                          {isSelected ? "▼" : "▶"}
                        </span>
                        <span>#{c.id} {c.title}</span>
                      </button>
                      <span className="text-[11px] rounded px-2 py-0.5" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                        {typeof c.alert_count === "number" ? c.alert_count : alerts.length} alerts attached
                      </span>
                    </div>

                    {/* Actions & Status */}
                    <div className="flex flex-wrap items-center gap-2.5 text-xs">
                      {/* Status Selector */}
                      <select
                        value={c.status}
                        onChange={(e) => handleStatusChange(c.id, e.target.value)}
                        className="rounded border px-2 py-1 text-[11px] font-medium cursor-pointer outline-none"
                        style={{
                          borderColor: "var(--border-hair)",
                          background: "var(--bg-inset)",
                          color: c.status === "closed" ? "var(--accent-teal)" : c.status === "in_review" ? "var(--accent-copper)" : "var(--text-primary)",
                        }}
                        title="Change case lifecycle status"
                      >
                        <option value="open">Status: Open</option>
                        <option value="in_review">Status: In Review</option>
                        <option value="closed">Status: Closed</option>
                      </select>

                      {/* Export JSON Button */}
                      <a
                        href={caseExportUrl(c.id, "json")}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border px-2.5 py-1 text-[11px] font-medium transition-colors hover:bg-white/5 flex items-center gap-1"
                        style={{ borderColor: "var(--border-hair)", color: "var(--text-secondary)" }}
                        title="Download structured JSON report"
                      >
                        <span>💾</span>
                        <span>JSON</span>
                      </a>

                      {/* Export PDF Button */}
                      <a
                        href={caseExportUrl(c.id, "pdf")}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded border px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/5 flex items-center gap-1"
                        style={{ borderColor: "var(--accent-copper)", color: "var(--accent-copper)" }}
                        title="Download multi-page PDF forensic dossier"
                      >
                        <span>📄</span>
                        <span>PDF Report</span>
                      </a>

                      {/* Safe Delete with Confirmation */}
                      <button
                        type="button"
                        onClick={() => handleDeleteCase(c)}
                        className="rounded border px-2 py-1 text-[11px] transition-colors hover:bg-red-500/10"
                        style={{ borderColor: "rgba(193,82,75,0.3)", color: "var(--accent-red)" }}
                        title="Delete this case"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Expanded Case Details & Attached Alerts */}
                  {isSelected && (
                    <div className="mt-4 flex flex-col gap-4 border-t pt-4" style={{ borderColor: "var(--border-hair-soft)" }}>
                      {/* Investigator Notes / Findings */}
                      <div className="flex flex-col gap-1.5">
                        <div className="flex items-center justify-between">
                          <label className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--text-muted)" }}>
                            Investigator Notes &amp; Findings (Included in PDF Dossier)
                          </label>
                          <button
                            type="button"
                            disabled={savingNote}
                            onClick={() => handleSaveNote(c.id)}
                            className="rounded px-2.5 py-0.5 text-[11px] font-medium transition-all hover:brightness-110 disabled:opacity-50"
                            style={{ background: "var(--accent-teal)", color: "#0b0e14" }}
                          >
                            {savingNote ? "Saving..." : "Save Notes"}
                          </button>
                        </div>
                        <textarea
                          rows={3}
                          value={editingNote}
                          onChange={(e) => setEditingNote(e.target.value)}
                          placeholder="Record findings, suspect affiliations, subpoenas served, or judicial conclusions..."
                          className="w-full rounded-sm border p-2.5 text-xs outline-none transition-colors focus:border-teal-500 custom-scrollbar"
                          style={{ borderColor: "var(--border-hair)", background: "var(--bg-inset)", color: "var(--text-primary)" }}
                        />
                      </div>

                      {/* Attached Alerts Table */}
                      <div>
                        <div className="text-[11px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--text-muted)" }}>
                          Attached Forensic Evidence ({alerts.length})
                        </div>

                        {alerts.length === 0 ? (
                          <div className="rounded p-3 text-xs text-center" style={{ background: "var(--bg-inset)", color: "var(--text-muted)" }}>
                            No alerts attached to this case yet. Go to the <strong>Investigation</strong> tab and click &ldquo;Attach Alert to Case File&rdquo; on any alert.
                          </div>
                        ) : (
                          <div className="flex flex-col gap-2">
                            {alerts.map((a) => {
                              const reasons = Array.isArray(a.reasons) ? a.reasons : [a.reasons].filter(Boolean);
                              const score = typeof a.score === "number" ? a.score : 0;
                              const risk = riskLabel(score);

                              return (
                                <div
                                  key={a.id}
                                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded border p-2.5 text-xs"
                                  style={{ borderColor: "var(--border-hair-soft)", background: "var(--bg-inset)" }}
                                >
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="data font-bold" style={{ color: "var(--text-primary)" }}>
                                        {a.alert_id}
                                      </span>
                                      <span className="data text-[11px]" style={{ color: "var(--text-muted)" }}>
                                        {truncateId(a.txid || "", 10, 4)}
                                      </span>
                                      {a.src_ip && (
                                        <span className="rounded px-1.5 py-0.2 text-[10px]" style={{ background: "var(--bg-panel)", color: "var(--accent-blue)" }}>
                                          IP: {a.src_ip} {a.geo_country ? `(${a.geo_country})` : ""}
                                        </span>
                                      )}
                                    </div>
                                    {reasons.length > 0 && (
                                      <div className="flex flex-wrap gap-1">
                                        {reasons.map((r, i) => (
                                          <span key={i} className="text-[10px]" style={{ color: "var(--text-secondary)" }}>
                                            • {r}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-3 shrink-0">
                                    <div className="text-right">
                                      <span className="data font-bold text-sm" style={{ color: score >= 70 ? "var(--accent-red)" : "var(--accent-copper)" }}>
                                        {formatScore(score)}
                                      </span>
                                      <div className="text-[10px] uppercase font-medium" style={{ color: "var(--text-muted)" }}>
                                        {risk} · {formatPercent(a.confidence ?? 0.8)} conf
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
