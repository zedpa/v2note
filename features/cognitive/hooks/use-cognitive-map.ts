"use client";

import { useState, useCallback } from "react";
import {
  fetchClusters,
  fetchClusterDetail,
  type ClusterSummary,
  type ClusterDetail,
} from "@/shared/lib/api/cognitive";
import { getGatewayHttpUrl } from "@/shared/lib/gateway-url";

export function useCognitiveMap() {
  const [clusters, setClusters] = useState<ClusterSummary[]>([]);
  const [selectedDetail, setSelectedDetail] = useState<ClusterDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadClusters = useCallback(async () => {
    try {
      setLoading(true);
      const data = await fetchClusters();
      setClusters(data);
    } catch (e: any) {
      console.error(
        "[cognitive-map] Failed to load clusters:",
        e.message,
        "\n  gatewayUrl:", getGatewayHttpUrl(),
        "\n  error:", e,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDetail = useCallback(async (id: string) => {
    try {
      setDetailLoading(true);
      const data = await fetchClusterDetail(id);
      setSelectedDetail(data);
    } catch (e: any) {
      console.error("[cognitive-map] Failed to load detail:", e.message, "\n  error:", e);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const clearDetail = useCallback(() => {
    setSelectedDetail(null);
  }, []);

  return {
    clusters,
    selectedDetail,
    loading,
    detailLoading,
    loadClusters,
    loadDetail,
    clearDetail,
  };
}
