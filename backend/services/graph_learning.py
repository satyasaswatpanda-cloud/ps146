"""
Graph learning + density clustering of wallets.

Pipeline
  1. Behavioural embeddings : per-wallet behaviour vectors (entities.wallet_behavior)
     -> StandardScaler -> PCA.
  2. Structural embeddings  : an unsupervised GraphSAGE encoder (PyTorch
     Geometric) trained with a link-reconstruction objective over the
     hub-free backbone graph. Node features = node-kind one-hot, log-degree
     and (for wallets) the behavioural embedding.
     If torch / torch_geometric are not installed, a deterministic fallback is
     used: two rounds of symmetric-normalised neighbourhood propagation
     (a weight-free GCN) followed by truncated SVD. The `method` field in the
     result says which path ran.
  3. DBSCAN on [structural || behavioural] embeddings. Dense groups become
     behavioural wallet clusters; DBSCAN noise points are reported as
     behavioural outliers (a risk signal at wallet level).
"""
from __future__ import annotations

from typing import Any, Dict, List

import numpy as np
from sklearn.cluster import DBSCAN
from sklearn.decomposition import PCA, TruncatedSVD
from sklearn.neighbors import NearestNeighbors
from sklearn.preprocessing import StandardScaler

from backend.services.entities import BEHAVIOR_FEATURES, wallet_behavior

SEED = 42
KINDS = ["wallet", "transaction", "ip", "peer"]
MAX_GNN_NODES = 40_000


def _node_matrix(nodes: List[str], bb, wallet_beh: Dict[str, np.ndarray], beh_dim: int) -> np.ndarray:
    X = np.zeros((len(nodes), len(KINDS) + 1 + beh_dim), dtype=np.float32)
    for i, n in enumerate(nodes):
        kind = bb.nodes[n].get("kind")
        if kind in KINDS:
            X[i, KINDS.index(kind)] = 1.0
        X[i, len(KINDS)] = np.log1p(bb.degree(n))
        if n in wallet_beh:
            X[i, len(KINDS) + 1:] = wallet_beh[n]
    return X


def _spectral_embed(nodes, bb, X, dim):
    import scipy.sparse as sp
    idx = {n: i for i, n in enumerate(nodes)}
    rows, cols = [], []
    for u, v in bb.edges:
        rows += [idx[u], idx[v]]
        cols += [idx[v], idx[u]]
    n = len(nodes)
    A = sp.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n)).tocsr() + sp.identity(n, format="csr")
    d = np.asarray(A.sum(axis=1)).ravel()
    dinv = sp.diags(1.0 / np.sqrt(d))
    A_hat = dinv @ A @ dinv
    H = A_hat @ (A_hat @ X)
    k = max(2, min(dim, H.shape[1] - 1, n - 1))
    return TruncatedSVD(n_components=k, random_state=SEED).fit_transform(H)


def _pyg_embed(nodes, bb, X, dim, epochs=60):
    import torch
    import torch.nn.functional as F
    from torch_geometric.nn import SAGEConv
    from torch_geometric.utils import negative_sampling

    torch.manual_seed(SEED)
    idx = {n: i for i, n in enumerate(nodes)}
    edges = [(idx[u], idx[v]) for u, v in bb.edges]
    edge_index = torch.tensor(edges + [(v, u) for u, v in edges], dtype=torch.long).t().contiguous()
    x = torch.tensor(X, dtype=torch.float32)

    class Encoder(torch.nn.Module):
        def __init__(self, d_in, d_hid, d_out):
            super().__init__()
            self.c1, self.c2 = SAGEConv(d_in, d_hid), SAGEConv(d_hid, d_out)

        def forward(self, feats, ei):
            return self.c2(F.relu(self.c1(feats, ei)), ei)

    model = Encoder(x.shape[1], 32, dim)
    opt = torch.optim.Adam(model.parameters(), lr=0.01)
    for _ in range(epochs):
        model.train()
        opt.zero_grad()
        z = model(x, edge_index)
        pos = (z[edge_index[0]] * z[edge_index[1]]).sum(-1)
        neg_ei = negative_sampling(edge_index, num_nodes=x.shape[0], num_neg_samples=edge_index.shape[1])
        neg = (z[neg_ei[0]] * z[neg_ei[1]]).sum(-1)
        loss = -F.logsigmoid(pos).mean() - F.logsigmoid(-neg).mean()
        loss.backward()
        opt.step()
    model.eval()
    with torch.no_grad():
        return model(x, edge_index).cpu().numpy()


def learn_embeddings(nodes, bb, X, dim=16):
    if len(nodes) <= MAX_GNN_NODES:
        try:
            return _pyg_embed(nodes, bb, X, dim), "pyg-graphsage"
        except ImportError:
            pass
        except Exception:  # pragma: no cover - a GNN failure must not break the pipeline
            pass
    return _spectral_embed(nodes, bb, X, dim), "gcn-propagation+svd (PyG unavailable)"


def cluster_wallets(records: List[Dict[str, Any]], bb, tx_pattern_txids=None, min_samples: int = 3) -> Dict[str, Any]:
    beh = wallet_behavior(records, tx_pattern_txids)
    wallets = list(beh)
    if len(wallets) < max(8, min_samples * 2):
        return {"status": "skipped", "reason": f"needs >= 8 wallets (got {len(wallets)})", "clusters": [],
                "wallet_label": {}, "outliers": []}

    M = np.array([beh[w] for w in wallets], dtype=float)
    scaled = StandardScaler().fit_transform(M)
    beh_dim = max(2, min(8, M.shape[1], len(wallets) - 1))
    B = PCA(n_components=beh_dim, random_state=SEED).fit_transform(scaled)
    wallet_beh = {w: B[i] for i, w in enumerate(wallets)}

    nodes = list(bb.nodes)
    X = _node_matrix(nodes, bb, wallet_beh, beh_dim)
    emb, method = learn_embeddings(nodes, bb, X)
    pos = {n: i for i, n in enumerate(nodes)}
    S = emb[[pos[w] for w in wallets]]
    S = S / (np.linalg.norm(S, axis=1, keepdims=True) + 1e-9)
    Bz = StandardScaler().fit_transform(B)
    Z = np.hstack([S * 2.0, Bz * 0.7])

    k = min(min_samples, len(wallets) - 1)
    dists, _ = NearestNeighbors(n_neighbors=k + 1).fit(Z).kneighbors(Z)
    eps = max(float(np.percentile(dists[:, -1], 85)), 1e-6)
    labels = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(Z)

    clusters, wallet_label = [], {}
    for lab in sorted(set(labels) - {-1}, key=lambda l: -int((labels == l).sum())):
        members = [i for i, l in enumerate(labels) if l == lab]
        cid = f"BHV-{len(clusters) + 1:02d}"
        mean = M[members].mean(axis=0)
        clusters.append({
            "cluster_id": cid, "size": len(members),
            "profile": {name: round(float(mean[j]), 3) for j, name in enumerate(BEHAVIOR_FEATURES)
                        if name in ("tx_as_input", "tx_as_output", "distinct_ips", "mean_output_fanout",
                                    "nonstandard_port_share", "pattern_share")},
            "sample_wallets": [wallets[i] for i in members[:5]],
        })
        for i in members:
            wallet_label[wallets[i]] = cid
    outliers = [wallets[i] for i, l in enumerate(labels) if l == -1]
    for w in outliers:
        wallet_label[w] = "outlier"

    return {
        "status": "active", "method": method, "embedding_dim": int(emb.shape[1]), "behavior_dim": int(beh_dim),
        "algorithm": "DBSCAN", "eps": round(eps, 4), "min_samples": min_samples,
        "wallets_embedded": len(wallets), "clusters": clusters[:20], "outliers": outliers,
        "outlier_count": len(outliers), "wallet_label": wallet_label,
    }
