"""
backend/services/reports.py

Forensic investigation report generation service for persistent cases.
Produces:
1. Machine-readable JSON reports (conforming to SIH demonstration standards)
2. Professional multi-page vector PDF reports (using built-in matplotlib.backends.backend_pdf)

All operations are strictly READ-ONLY and adhere strictly to actual case/alert schema fields.
"""

import io
import textwrap
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
from matplotlib.backends.backend_pdf import PdfPages
from matplotlib.patches import FancyBboxPatch


REPORT_CLASSIFICATION = "SIH Demonstration / Forensic Analysis Report"
APPLICATION_NAME = "Bitcoin Traffic Intelligence Prototype (SIH 2026)"


def build_case_json_report(case: Dict[str, Any]) -> Dict[str, Any]:
    """
    Builds a machine-readable forensic investigation report dictionary for a case.
    Strictly read-only; maps only verified existing fields.
    """
    generated_at = datetime.now(timezone.utc).isoformat()
    
    alerts_raw = case.get("alerts", [])
    alerts_export: List[Dict[str, Any]] = []
    
    for a in alerts_raw:
        alerts_export.append({
            "id": a.get("id"),
            "case_id": a.get("case_id"),
            "alert_id": a.get("alert_id"),
            "txid": a.get("txid"),
            "src_ip": a.get("src_ip"),
            "score": a.get("score"),
            "confidence": a.get("confidence"),
            "reasons": a.get("reasons") if isinstance(a.get("reasons"), list) else [a.get("reasons")] if a.get("reasons") else [],
            "geo_country": a.get("geo_country"),
            "asn": a.get("asn"),
            "analyst_note": a.get("analyst_note", ""),
            "created_at": a.get("created_at"),
        })

    return {
        "report_metadata": {
            "report_title": "Bitcoin Traffic Intelligence - Forensic Investigation Report",
            "generated_at": generated_at,
            "application": APPLICATION_NAME,
            "classification": REPORT_CLASSIFICATION,
        },
        "case": {
            "id": case.get("id"),
            "title": case.get("title", ""),
            "status": case.get("status", "open"),
            "description": case.get("description", ""),
            "analyst_note": case.get("analyst_note", ""),
            "created_at": case.get("created_at"),
            "updated_at": case.get("updated_at"),
            "alert_count": case.get("alert_count", len(alerts_export)),
            "alerts": alerts_export,
        },
    }


def build_case_pdf_report(case: Dict[str, Any]) -> bytes:
    """
    Renders a multi-page vector PDF forensic investigation report for a case.
    Strictly read-only; utilizes matplotlib.backends.backend_pdf.PdfPages in memory.
    """
    buf = io.BytesIO()
    alerts = case.get("alerts", [])
    
    # Partition alerts across pages
    # Page 1: Case header, metadata, scope, and analyst notes + 1 alert (if available)
    # Subsequent pages: 2 alerts per page with continuation header
    pages_alerts: List[List[Dict[str, Any]]] = []
    if alerts:
        pages_alerts.append([alerts[0]])
        remaining = alerts[1:]
        for i in range(0, len(remaining), 2):
            pages_alerts.append(remaining[i:i + 2])
    else:
        pages_alerts.append([])

    total_pages = len(pages_alerts)
    generated_at = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")

    # Color palette
    c_navy = "#0f172a"
    c_blue = "#2563eb"
    c_gray_bg = "#f8fafc"
    c_border = "#cbd5e1"
    c_text_dark = "#1e293b"
    c_text_muted = "#64748b"
    c_accent = "#dc2626"

    with PdfPages(buf) as pdf:
        for page_idx, page_alerts in enumerate(pages_alerts, start=1):
            fig = plt.figure(figsize=(8.5, 11), dpi=150)
            fig.patch.set_facecolor("#ffffff")
            ax = fig.add_axes([0, 0, 1, 1])
            ax.axis("off")
            ax.set_xlim(0, 8.5)
            ax.set_ylim(0, 11)

            if page_idx == 1:
                # Top decorative bar
                ax.fill_between([0.6, 7.9], [10.45, 10.45], [10.50, 10.50], color=c_blue)
                
                # Header Titles
                ax.text(0.6, 10.20, "BITCOIN TRAFFIC INTELLIGENCE", fontsize=15, weight="bold", color=c_navy)
                ax.text(0.6, 9.92, "FORENSIC INVESTIGATION REPORT", fontsize=11, weight="bold", color=c_blue)
                
                # Classification & Metadata
                ax.text(7.9, 10.20, f"CLASSIFICATION: {REPORT_CLASSIFICATION}",
                        fontsize=7.5, weight="bold", color=c_text_muted, ha="right")
                ax.text(7.9, 9.95, f"Generated: {generated_at}",
                        fontsize=7.5, color=c_text_muted, ha="right")

                # Header Divider
                ax.plot([0.6, 7.9], [9.75, 9.75], color=c_border, lw=1)

                # Case Summary Box
                box = FancyBboxPatch((0.6, 8.20), 7.3, 1.40,
                                     boxstyle="round,pad=0.08,rounding_size=0.1",
                                     ec=c_border, fc=c_gray_bg, lw=1)
                ax.add_patch(box)

                # Left column
                ax.text(0.8, 9.35, f"CASE ID: #{case.get('id', 'N/A')}", fontsize=11, weight="bold", color=c_navy)
                title_text = textwrap.shorten(f"Title: {case.get('title', 'Untitled')}", width=60, placeholder="...")
                ax.text(0.8, 9.05, title_text, fontsize=9.5, weight="bold", color=c_text_dark)
                
                status_str = str(case.get("status", "open")).upper()
                status_color = "#16a34a" if status_str == "CLOSED" else ("#d97706" if status_str == "INVESTIGATING" else "#2563eb")
                ax.text(0.8, 8.75, "Status: ", fontsize=9, color=c_text_dark)
                ax.text(1.3, 8.75, status_str, fontsize=9, weight="bold", color=status_color)
                
                # Right column
                ax.text(4.8, 9.35, f"Attached Alerts: {case.get('alert_count', len(alerts))}", fontsize=9, weight="bold", color=c_navy)
                ax.text(4.8, 9.05, f"Created: {case.get('created_at', 'N/A')}", fontsize=8, color=c_text_muted)
                ax.text(4.8, 8.75, f"Updated: {case.get('updated_at', 'N/A')}", fontsize=8, color=c_text_muted)

                # Case Scope & Description Box
                desc = (case.get("description") or "").strip() or "No specific scope or description provided."
                wrapped_desc = "\n".join(textwrap.wrap(desc, width=95)[:3])
                ax.text(0.6, 8.00, "CASE DESCRIPTION & SCOPE", fontsize=8.5, weight="bold", color=c_navy)
                box_desc = FancyBboxPatch((0.6, 7.15), 7.3, 0.70,
                                         boxstyle="round,pad=0.06,rounding_size=0.08",
                                         ec=c_border, fc="#ffffff", lw=0.8)
                ax.add_patch(box_desc)
                ax.text(0.75, 7.65, wrapped_desc, fontsize=8, color=c_text_dark, va="top")

                # Case-Level Analyst Notes Box
                note = (case.get("analyst_note") or "").strip() or "No general analyst notes recorded."
                wrapped_note = "\n".join(textwrap.wrap(note, width=95)[:3])
                ax.text(0.6, 6.95, "CASE-LEVEL ANALYST NOTES", fontsize=8.5, weight="bold", color=c_navy)
                box_note = FancyBboxPatch((0.6, 6.10), 7.3, 0.70,
                                         boxstyle="round,pad=0.06,rounding_size=0.08",
                                         ec=c_border, fc="#ffffff", lw=0.8)
                ax.add_patch(box_note)
                ax.text(0.75, 6.60, wrapped_note, fontsize=8, color=c_text_dark, va="top")

                # Section Title for Alerts
                ax.text(0.6, 5.85, "ATTACHED FORENSIC ALERTS & EVIDENCE", fontsize=9.5, weight="bold", color=c_navy)
                ax.plot([0.6, 7.9], [5.73, 5.73], color=c_border, lw=0.8)

                start_y = 5.50
            else:
                # Continuation Header
                ax.fill_between([0.6, 7.9], [10.45, 10.45], [10.50, 10.50], color=c_blue)
                ax.text(0.6, 10.20, "BITCOIN TRAFFIC INTELLIGENCE", fontsize=12, weight="bold", color=c_navy)
                ax.text(0.6, 9.95, f"CASE #{case.get('id', 'N/A')} EVIDENCE DOSSIER (CONTINUED)",
                        fontsize=10, weight="bold", color=c_blue)
                ax.text(7.9, 10.05, f"Classification: {REPORT_CLASSIFICATION}",
                        fontsize=7.5, color=c_text_muted, ha="right")
                ax.plot([0.6, 7.9], [9.80, 9.80], color=c_border, lw=0.8)

                start_y = 9.50

            # Render Alerts
            if not page_alerts and page_idx == 1:
                box_empty = FancyBboxPatch((0.6, 4.50), 7.3, 0.90,
                                           boxstyle="round,pad=0.08,rounding_size=0.1",
                                           ec=c_border, fc=c_gray_bg, lw=1)
                ax.add_patch(box_empty)
                ax.text(4.25, 4.95, "No forensic alerts are attached to this investigation case.",
                        ha="center", va="center", fontsize=9, color=c_text_muted, fontstyle="italic")
            else:
                curr_y = start_y
                card_height = 2.40 if page_idx == 1 else 2.50
                for a in page_alerts:
                    box_alert = FancyBboxPatch((0.6, curr_y - card_height), 7.3, card_height,
                                               boxstyle="round,pad=0.08,rounding_size=0.1",
                                               ec=c_border, fc=c_gray_bg, lw=1)
                    ax.add_patch(box_alert)

                    # Alert Header Line
                    alt_id = a.get("alert_id") or f"ALT-REC-{a.get('id', '???')}"
                    score = float(a.get("score") or 0.0)
                    conf = float(a.get("confidence") or 0.0)
                    ax.text(0.8, curr_y - 0.30, f"ALERT ID: {alt_id}", fontsize=9.5, weight="bold", color=c_navy)
                    
                    score_col = c_accent if score >= 80 else ("#d97706" if score >= 50 else "#2563eb")
                    ax.text(4.0, curr_y - 0.30, f"Score: {score:.1f}/100", fontsize=9, weight="bold", color=score_col)
                    ax.text(5.5, curr_y - 0.30, f"Confidence: {conf:.2f}", fontsize=8.5, color=c_text_dark)
                    
                    created_alt = str(a.get("created_at") or "N/A")
                    ax.text(7.7, curr_y - 0.30, f"Attached: {created_alt[:10]}", fontsize=7.5, color=c_text_muted, ha="right")

                    # Divider inside card
                    ax.plot([0.8, 7.7], [curr_y - 0.45, curr_y - 0.45], color=c_border, lw=0.6)

                    # TXID
                    txid = a.get("txid") or "N/A"
                    ax.text(0.8, curr_y - 0.70, "Transaction ID (txid):", fontsize=7.5, weight="bold", color=c_text_muted)
                    ax.text(0.8, curr_y - 0.90, txid, fontsize=7.5, family="monospace", color=c_navy)

                    # Traffic Origin (IP, Geo, ASN)
                    src_ip = a.get("src_ip") or "Unknown"
                    country = a.get("geo_country") or "Unknown"
                    asn = a.get("asn") or "Unknown"
                    origin_line = f"Origin IP: {src_ip}   |   Country: {country}   |   Autonomous System: {asn}"
                    ax.text(0.8, curr_y - 1.20, origin_line, fontsize=8, weight="bold", color=c_text_dark)

                    # Detection Reasons
                    reasons = a.get("reasons", [])
                    reasons_list = reasons if isinstance(reasons, list) else [reasons]
                    reasons_text = ", ".join(reasons_list) if reasons_list else "None documented"
                    wrapped_reasons = "\n".join(textwrap.wrap(f"Detection Reasons: {reasons_text}", width=95)[:2])
                    ax.text(0.8, curr_y - 1.45, wrapped_reasons, fontsize=7.5,
                            color="#b91c1c" if reasons_list else c_text_muted, va="top")

                    # Alert Analyst Note
                    alt_note = (a.get("analyst_note") or "").strip() or "No note attached for this alert."
                    wrapped_alt_note = "\n".join(textwrap.wrap(f"Analyst Note: {alt_note}", width=95)[:2])
                    ax.text(0.8, curr_y - 1.95, wrapped_alt_note, fontsize=7.5, color=c_text_dark, va="top")

                    curr_y -= (card_height + 0.35)

            # Footer
            ax.plot([0.6, 7.9], [0.55, 0.55], color=c_border, lw=0.8)
            ax.text(0.6, 0.38, "SIH 2026 Prototype • Bitcoin Traffic Intelligence • Academic / Demonstration Use Only",
                    fontsize=7, color=c_text_muted)
            ax.text(7.9, 0.38, f"Page {page_idx} of {total_pages}",
                    fontsize=7.5, weight="bold", color=c_navy, ha="right")

            pdf.savefig(fig)
            plt.close(fig)

    buf.seek(0)
    return buf.getvalue()
