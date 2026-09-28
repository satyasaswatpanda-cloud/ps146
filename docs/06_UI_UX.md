# UI/UX: Forensic Investigation Console

## 1. Design Philosophy
The frontend dashboard is designed as a dark-mode forensic investigation console (`frontend/index.html`, `frontend/assets/style.css`, `frontend/assets/app.js`), emphasizing high contrast, information density, explainable evidence presentation, and full offline operability.

---

## 2. Core Dashboard Components

### A. Control Bar & Ingestion
* **`Run sample analysis` Button**: One-click execution of the bundled 60-record dataset through the complete backend pipeline.
* **`Analyze CSV / JSON / XML` Upload**: File input handling multi-format uploads up to 10 MB.
* **Status Badge**: Visual indicator confirming `● Local / Offline` operation.

### B. Summary Metric Cards
Displays real-time counts for:
* Total Records Analyzed
* Flagged Anomaly Alerts
* Entity Graph Nodes
* Entity Graph Edges
* Detected Entity Clusters

### C. Interactive Cytoscape Link-Analysis Graph
* **Interactive Canvas**: Force-directed layout powered by locally bundled `cytoscape.min.js`.
* **Toolbar Controls**: `[Fit]`, `[Zoom +]`, `[Zoom −]`, `[Reset]` buttons.
* **Legend & Visual Encoding**:
  * IP (Teal rounded-rect)
  * Transaction (Purple ellipse)
  * Wallet (Orange diamond)
  * Country (Green hexagon)
  * ASN (Blue triangle)
  * Flagged/Anomaly Entities (Prominent pulsing red highlight `#ff4757`).
* **Interactivity**: Clicking any node or edge highlights connections and populates the entity inspector panel.

### D. Entity Evidence & Details Inspector
* Displays selected entity ID, entity kind, and degree centrality.
* For flagged entities: displays alert identifier, anomaly score, confidence value, and specific detection reasons.
* Interactive neighbor list allowing analysts to navigate directly between connected entities.

### E. Prioritized Anomaly Alerts & Entity Clusters
* **Alert Feed**: Displays top 20 alerts sorted by anomaly score with confidence and detection reasons. Includes a `+ Case` button to attach leads directly to investigation dossiers.
* **Clusters Panel**: Renders behavioral clusters with member counts by type, total BTC volume, and `"🚨 Contains Alert"` badges.

### F. Persistent Investigation Cases Panel
* **Case Workspace**: Filterable list (`All`, `Open`, `Investigating`, `Closed`) backed by local SQLite.
* **Case Creation Form**: Collapsible modal/card to title, describe, and annotate new cases.
* **Case Details & Evidence Dossier**:
  * Real-time status update dropdown (`open`, `investigating`, `closed`).
  * Editable case-level analyst notes textarea with auto-save.
  * List of attached forensic alerts with alert-level notes.
* **Export Controls**:
  * `[⬇ Export JSON]`: Downloads machine-readable JSON dossier.
  * `[📄 Export PDF]`: Downloads multi-page forensic vector PDF report.
