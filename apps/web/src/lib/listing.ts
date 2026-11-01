import { PLATFORMS, PRICING, RANK_SORTS, STAGES, type RankSort } from "@tm/shared/enums";

const ALLOWED: Record<string, readonly string[]> = {
  ai: ["1"],
  pricing: PRICING,
  stage: STAGES,
  perk: ["1"],
  platform: PLATFORMS,
};

export interface ListParams {
  sort: RankSort;
  /** Valid filter params only, in a stable order. */
  filters: URLSearchParams;
  /** Only the default view without filters is indexed (docs/SEO.md). */
  indexable: boolean;
}

/** Reads the view (`sort`) and the filters from a page URL, dropping unknown values. */
export function listParams(url: URL): ListParams {
  const raw = url.searchParams.get("sort");
  const sort = (RANK_SORTS as readonly string[]).includes(raw ?? "") ? (raw as RankSort) : "top";
  const filters = new URLSearchParams();
  for (const [key, values] of Object.entries(ALLOWED)) {
    const v = url.searchParams.get(key);
    if (v && values.includes(v)) filters.set(key, v);
  }
  return { sort, filters, indexable: sort === "top" && filters.toString() === "" && !url.searchParams.has("sort") };
}

/** Query string for filters alone, on pages whose path picks the view (/top, /trending). */
export function filterQuery(filters: URLSearchParams): string {
  return listQuery("top", filters);
}

/** Query string for a view plus filters ("" for the default view without filters). */
export function listQuery(sort: RankSort, filters: URLSearchParams): string {
  const q = new URLSearchParams(filters);
  if (sort !== "top") q.set("sort", sort);
  const s = q.toString();
  return s ? `?${s}` : "";
}
