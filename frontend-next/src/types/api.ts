// Mirrors the JSON shapes returned by backend/main.py + backend/services/pipeline.py.
// Kept intentionally permissive (optional fields) since several stages
// (CatBoost, Neo4j/GDS, local LLM, PyG) degrade to null/None at runtime.

export interface ShapContribution {
  feature: string;
  shap_value: number;
  direction: string;
}

export interface NetworkOriginChainLink {
  level: "ip" | "country" | "asn";
  value: string | null;
}

export interface NetworkOrigin {
  src_ip: string;
  asn: string | null;
  country: string | null;
  relay_share: number;
  observations: number;
  confidence: number;
  chain: NetworkOriginChainLink[];
  note: string;
}

export interface Narrative {
  text: string;
  source: string;
  validation: { grounded: boolean; issues: string[] };
  llm_rejected?: string[];
}

export interface Alert {
  id: string;
  txid: string;
  src_ip: string;
  geo_country: string;
  asn: string;
  score: number;
  confidence: number;
  reasons: string[];
  shap_explanation: ShapContribution[] | null;
  catboost_shap_explanation: ShapContribution[] | null;
  patterns: string[];
  entity_id: string | null;
  network_origin: NetworkOrigin | null;
  detectors: {
    isolation_forest: "outlier" | "inlier";
    catboost: number | null;
    graph_pattern: boolean;
  };
  narrative?: Narrative;
}

export interface CytoNodeData {
  id: string;
  label: string;
  kind: string;
  degree: number;
  connected_count: number;
  is_flagged: boolean;
  relationships: { neighbor_id: string; neighbor_kind: string; relation: string }[];
  metadata: Record<string, unknown>;
  alert_id?: string;
  alert_score?: number;
  confidence?: number;
  flag_reasons?: string[];
  patterns?: string[];
  entity_id?: string;
}

export interface CytoEdgeData {
  id: string;
  source: string;
  target: string;
  relation: string;
  label: string;
}

export interface GraphElements {
  nodes: { data: CytoNodeData }[];
  edges: { data: CytoEdgeData }[];
}

export interface GraphSummary {
  nodes: number;
  edges: number;
  node_kinds: Record<string, number>;
  top_nodes: { id: string; kind: string; centrality: number }[];
  truncated: boolean;
  exported_nodes: number;
  elements: GraphElements;
}

export interface PeelingChain {
  chain_id: string;
  pattern: "peeling_chain";
  length: number;
  txids: string[];
  change_addresses: string[];
  start_value: number;
  peeled_total: number;
  final_change: number;
  median_gap_seconds: number | null;
  network: { src_ips: Record<string, number>; dominant_ip: string; dominant_ip_share: number };
  single_relay_origin: boolean;
  score: number;
  reason: string;
}

export interface MixingEvent {
  mix_id: string;
  pattern: "mixing_like";
  txid: string;
  inputs: number;
  outputs: number;
  equal_output_value: number;
  equal_output_count: number;
  src_ip: string;
  asn: string;
  geo_country: string;
  score: number;
  reason: string;
}

export interface MixingFlowHop {
  txid: string;
  from_address?: string;
  address?: string;
  src_ip: string;
  geo_country: string;
  asn: string;
  timestamp: string;
  output_addresses?: string[];
}

export interface MixingFlow {
  flow_id: string;
  mixer_txid: string;
  mixer_src_ip: string;
  pre_mix_sources: MixingFlowHop[];
  pre_mix_count: number;
  post_mix_hops: MixingFlowHop[][];
  post_mix_reach: number;
  same_relay_before_and_after: string[];
  note: string;
}

export interface PatternsBlock {
  peeling_chains: PeelingChain[];
  mixing_events: MixingEvent[];
  summary: { peeling_chains: number; mixing_events: number; transactions_in_patterns: number };
}

export interface Entity {
  entity_id: string;
  wallet_count: number;
  wallets: string[];
  transactions: number;
  total_received: number;
  total_sent: number;
  heuristics: string[];
  first_seen: number | null;
  last_seen: number | null;
  network_origin: NetworkOrigin | null;
}

export interface EntitiesBlock {
  entities: Entity[];
  summary: { wallets: number; multi_wallet_entities: number; largest_entity: number };
}

export interface NetworkBridge {
  src_ip: string;
  asn: string;
  geo_country: string;
  linked_actors: number;
  sample_txids: string[];
  note: string;
}

export interface WalletCluster {
  cluster_id: string;
  size: number;
  profile: Record<string, number>;
  sample_wallets: string[];
}

export interface WalletClusters {
  status: "active" | "skipped";
  reason?: string;
  method?: string;
  embedding_dim?: number;
  behavior_dim?: number;
  algorithm?: string;
  eps?: number;
  min_samples?: number;
  wallets_embedded?: number;
  clusters: WalletCluster[];
  outliers: string[];
  outlier_count: number;
}

export interface Cluster {
  cluster_id: string;
  size: number;
  contains_flagged_alert: boolean;
  [key: string]: unknown;
}

export interface IngestReport {
  engine: string;
  format: string;
  rows_read: number;
  rows_accepted: number;
  rows_rejected: number;
  rejected_examples: { row: number; field: string; error: string }[];
  columns: string[];
}

export interface GraphAnalyticsStage {
  stage: string;
  available: boolean;
  reason?: string;
  error?: string;
  graph_name?: string;
  algorithms_run?: string[];
  component_count?: number;
  nodes_scored?: number;
  top_entities_by_pagerank?: { id: string; kind: string; pagerank: number; component: number }[];
}

export interface AnalysisSummary {
  records: number;
  alerts: number;
  clusters: number;
  generated_at: string;
  model: string;
  data_notice: string;
  runtime_seconds: number;
  catboost: Record<string, unknown>;
  wallet_clustering: Record<string, unknown>;
}

export interface AnalyzeResult {
  summary: AnalysisSummary;
  alerts: Alert[];
  graph: GraphSummary;
  clusters: Cluster[];
  patterns: PatternsBlock;
  entities: EntitiesBlock;
  network_bridges: NetworkBridge[];
  wallet_clusters: WalletClusters;
  mixing_flows: MixingFlow[];
  neo4j_sync: { synced: boolean; reason?: string; nodes?: number; edges?: number } | null;
  graph_analytics: GraphAnalyticsStage | null;
  ingest_report?: IngestReport;
}

export interface StatusResponse {
  catboost: { available: boolean };
  shap: { available: boolean };
  mlflow: { enabled: boolean; tracking_uri?: string; reason?: string };
  local_llm: { enabled: boolean; reason?: string; reachable?: boolean };
  neo4j: { enabled: boolean; reachable?: boolean; reason?: string; gds: { available: boolean; reason?: string; version?: string } };
  max_upload_mb: number;
}

export interface CaseRecord {
  id: number;
  title: string;
  description: string;
  status: string;
  analyst_note: string;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

export interface CaseAlertAttachment {
  id: number;
  case_id: number;
  alert_id: string;
  txid?: string;
  src_ip?: string;
  score?: number;
  confidence?: number;
  reasons?: string[];
  analyst_note?: string;
  [key: string]: unknown;
}
