# Graph Model & Entity Link Analysis

## 1. Multi-Partite Entity Graph
The application constructs an in-memory multi-partite graph using NetworkX (`backend/services/graphing.py`) to correlate network-layer signals with blockchain-layer transactions.

### Node Types
* **`ip`**: Source IP address observing or relaying the Bitcoin traffic.
* **`transaction`**: Unique Bitcoin transaction hash (`txid`).
* **`wallet`**: Bitcoin wallet addresses appearing as inputs or outputs.
* **`country`**: Geographic jurisdiction code (e.g. `US`, `DE`, `IN`) derived via GeoIP enrichment.
* **`asn`**: Autonomous System number (e.g. `AS15169`, `AS64500`) routing the traffic.

*(Note: In the current prototype, destination IPs and ports are ingested but are not added as graph nodes).*

### Relationships (Edges)
* **`IP --observed--> Transaction`**: Connects the observing peer/relay node to the transaction.
* **`IP --geolocated_in--> Country`**: Connects the IP address to its geographic jurisdiction.
* **`IP --routed_via--> ASN`**: Connects the IP address to its routing network.
* **`Wallet --input--> Transaction`**: Connects the funding wallet address to the transaction.
* **`Transaction --output--> Wallet`**: Connects the transaction to the recipient wallet address.

---

## 2. Interactive Cytoscape.js Export
The backend serializes graph topology into Cytoscape-compliant JSON elements via `export_cytoscape_elements()`:
* **Node Elements**: Includes unique ID, formatted label, node kind, degree centrality, connected count, list of direct neighbor relationships, and metadata.
* **Flagged Entities**: Nodes tied to an anomaly alert are tagged with `is_flagged: true`, alert ID, score, and detection reasons.
* **Edge Elements**: Directed and typed edges (`source`, `target`, `relation`, `label`).

---

## 3. Graph-Based Entity Clustering
Entity clustering (`backend/services/clustering.py`) groups related entities using two deterministic, auditable graph algorithms:

1. **Connected Components**: Identifies subgraphs transitively linked by shared wallets, transactions, or observing IPs.
2. **Greedy Modularity Communities**: For large components exceeding 8 nodes, `nx.algorithms.community.greedy_modularity_communities` recursively partitions dense subgraphs into tighter behavioral activity clusters.
3. **Forensic Attribution**: Each cluster aggregates total observed Bitcoin volume, entity kind breakdown, and flags whether it contains any anomalous transaction.
