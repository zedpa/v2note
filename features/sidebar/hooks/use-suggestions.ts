import { useState, useCallback } from "react";
import { api } from "@/shared/lib/api";

export interface Suggestion {
  id: string;
  suggestion_type: string;
  payload: Record<string, any>;
  status: string;
  created_at: string;
}

/**
 * Wiki 建议管理 hook
 * 提供获取、接受、拒绝建议的功能
 */
export function useSuggestions() {
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await api.get<{ suggestions: Suggestion[] }>("/api/v1/wiki/suggestions");
      setSuggestions(res.suggestions ?? []);
    } catch {
      // 静默失败
    } finally {
      setLoading(false);
    }
  }, []);

  const accept = useCallback(async (id: string) => {
    const prev = suggestions;
    setSuggestions((s) => s.filter((item) => item.id !== id));
    try {
      await api.post(`/api/v1/wiki/suggestions/${id}/accept`, {});
    } catch {
      setSuggestions(prev); // 回滚
    }
  }, [suggestions]);

  const reject = useCallback(async (id: string) => {
    const prev = suggestions;
    setSuggestions((s) => s.filter((item) => item.id !== id));
    try {
      await api.post(`/api/v1/wiki/suggestions/${id}/reject`, {});
    } catch {
      setSuggestions(prev); // 回滚
    }
  }, [suggestions]);

  return { suggestions, loading, accept, reject, refresh };
}
