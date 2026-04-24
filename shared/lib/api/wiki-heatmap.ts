import { api } from "../api";

export interface HeatmapPage {
  id: string;
  title: string;
  level: number;
  parent_id: string | null;
  heat_score: number;
  heat_phase: "hot" | "active" | "silent" | "frozen";
  compiled_at: string | null;
}

export interface HeatmapData {
  pages: HeatmapPage[];
  summary: {
    hot: number;
    active: number;
    silent: number;
    frozen: number;
  };
}

export async function fetchHeatmap(): Promise<HeatmapData> {
  return api.get("/api/v1/wiki/heatmap");
}
