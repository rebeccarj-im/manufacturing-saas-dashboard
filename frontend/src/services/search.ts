// frontend/src/services/search.ts
import { apiGet, withQuery } from "@/lib/fetcher";

export interface SearchResult {
  id: string;
  title: string;
  description: string;
  type: string; // "page", "kpi", "dashboard", "module"
  url: string;
  category?: string;
}

export interface SearchParams {
  q: string;
  limit?: number;
}

/**
 * Search across pages, KPIs, and modules
 */
export async function search(params: SearchParams): Promise<SearchResult[]> {
  const path = withQuery("/api/search", params);
  return apiGet<SearchResult[]>(path);
}

