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
