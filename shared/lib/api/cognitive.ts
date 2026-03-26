import { api } from "../api";

export interface ClusterSummary {
  id: string;
  name: string;
  memberCount: number;
  lastRecordAt: string | null;
  hasContradiction: boolean;
  recentlyActive: boolean;
}

export interface ClusterMember {
  id: string;
  nucleus: string;
  polarity: string;
  confidence: number;
  created_at: string;
  tags: string[];
}

export interface ClusterDetail {
  id: string;
  name: string;
  members: ClusterMember[];
  contradictions: Array<{
    strikeA: { id: string; nucleus: string };
    strikeB: { id: string; nucleus: string };
  }>;
  patterns: Array<{ id: string; nucleus: string; confidence: number }>;
  intents: ClusterMember[];
}

export async function fetchClusters(): Promise<ClusterSummary[]> {
  return api.get("/api/v1/cognitive/clusters");
}

export async function fetchClusterDetail(
  id: string,
): Promise<ClusterDetail> {
  return api.get(`/api/v1/cognitive/clusters/${id}`);
}

export interface RelatedRecord {
  record_id: string;
  title: string;
  short_summary: string;
  relevance: number;
  created_at: string;
}

export interface RelatedResponse {
  related: RelatedRecord[];
  count: number;
}

export async function fetchRelatedRecords(
  recordId: string,
): Promise<RelatedResponse> {
  return api.get(`/api/v1/records/${recordId}/related`);
}

export async function createBond(params: {
  sourceStrikeId: string;
  targetStrikeId: string;
  type: string;
}): Promise<{ id: string }> {
  return api.post("/api/v1/cognitive/bonds", params);
}
