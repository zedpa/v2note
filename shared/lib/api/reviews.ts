import { api } from "../api";

export async function listReviews(): Promise<any[]> {
  return api.get("/api/v1/reviews");
}

export async function generateReview(fields: {
  period: string;
  start: string;
  end: string;
}): Promise<any> {
  return api.post("/api/v1/reviews/generate", fields);
}
