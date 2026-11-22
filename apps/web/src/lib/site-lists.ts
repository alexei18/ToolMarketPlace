import type { Page, ProductCardDTO } from "@tm/shared";
import type { RankSort } from "@tm/shared/enums";
import { apiCall } from "./api";
import { listParams, listQuery } from "./listing";

export interface SiteListView {
  sort: RankSort;
  /** Valid filter params; always empty on /new, which has no filter bar */
  filters: URLSearchParams;
  /** null when the API failed */
  page: Page<ProductCardDTO> | null;
}

/**
 * Data for /top, /trending and /new (every category). Rendered as a visitor so the cached page is the
 * same for everyone; members load the rest client-side.
 */
export async function loadSiteList(sort: RankSort, url: URL): Promise<SiteListView> {
  const filters = sort === "new" ? new URLSearchParams() : listParams(url).filters;
  const res = await apiCall<Page<ProductCardDTO>>(`/products${listQuery(sort, filters)}`);
  return { sort, filters, page: res.ok ? res.data : null };
}
