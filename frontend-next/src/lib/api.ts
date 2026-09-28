import type {
  AnalyzeResult,
  CaseAlertAttachment,
  CaseRecord,
  StatusResponse,
} from "@/types/api";

// Every function here calls a same-origin `/api/...` path. In dev, next.config.ts
// rewrites that to the FastAPI backend (BACKEND_ORIGIN, default 127.0.0.1:8000);
// in production, a reverse proxy should do the same. No other origin is ever
// contacted, which keeps the whole app usable fully offline.

async function asJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? detail;
    } catch {
      // ignore: body wasn't JSON
    }
    throw new Error(detail || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export function fetchStatus(): Promise<StatusResponse> {
  return fetch("/api/status").then(asJson<StatusResponse>);
}

export function analyzeSample(): Promise<AnalyzeResult> {
  return fetch("/api/sample").then(asJson<AnalyzeResult>);
}

export function analyzeFile(file: File): Promise<AnalyzeResult> {
  const form = new FormData();
  form.append("file", file);
  return fetch("/api/analyze", { method: "POST", body: form }).then(asJson<AnalyzeResult>);
}

export function listCases(status?: string): Promise<CaseRecord[]> {
  const qs = status ? `?status=${encodeURIComponent(status)}` : "";
  return fetch(`/api/cases${qs}`).then(asJson<CaseRecord[]>);
}

export function createCase(payload: {
  title: string;
  description?: string;
  status?: string;
  analyst_note?: string;
}): Promise<CaseRecord> {
  return fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<CaseRecord>);
}

export function updateCase(
  caseId: number,
  payload: Partial<{ title: string; description: string; status: string; analyst_note: string }>
): Promise<CaseRecord> {
  return fetch(`/api/cases/${caseId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<CaseRecord>);
}

export function deleteCase(caseId: number): Promise<{ deleted: boolean; case_id: number }> {
  return fetch(`/api/cases/${caseId}`, { method: "DELETE" }).then(
    asJson<{ deleted: boolean; case_id: number }>
  );
}

export function attachAlertToCase(
  caseId: number,
  payload: {
    alert_id: string;
    txid?: string;
    src_ip?: string;
    score?: number;
    confidence?: number;
    reasons?: string[];
    geo_country?: string;
    asn?: string;
    analyst_note?: string;
  }
): Promise<CaseAlertAttachment> {
  return fetch(`/api/cases/${caseId}/alerts`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(asJson<CaseAlertAttachment>);
}

export function getCaseAlerts(caseId: number): Promise<CaseAlertAttachment[]> {
  return fetch(`/api/cases/${caseId}/alerts`).then(asJson<CaseAlertAttachment[]>);
}

export function caseExportUrl(caseId: number, format: "json" | "pdf"): string {
  return `/api/cases/${caseId}/export/${format}`;
}
