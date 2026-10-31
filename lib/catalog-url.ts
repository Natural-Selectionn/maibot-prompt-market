import { templateCategories, type Kind, type Category } from "./prompts.ts";
import { normalizeVersion } from "./version-range.mjs";
import { isPromptSort, type PromptSort } from "./prompt-sort.ts";
import { formatSearch, parseSearch } from "./search.ts";

export type CatalogState = { search: string; kind: Kind; category: "全部" | Category; version: string; sort: PromptSort | "" };
export function readCatalogState(params: URLSearchParams): CatalogState {
  const kind = params.get("kind") === "template" ? "template" : "config";
  const category = params.get("category") ?? "";
  const sort = params.get("sort") ?? "";
  const tags = params.getAll("tag").map(value => value.trim()).filter(value => value && value.length <= 12).slice(0, 5);
  return {
    search: formatSearch((params.get("q") ?? "").slice(0, 80), tags).slice(0, 240), kind,
    category: kind === "template" && templateCategories.some(value => value === category) ? category as Category : "全部",
    version: normalizeVersion(params.get("version") ?? "") ?? "", sort: isPromptSort(sort) ? sort : "",
  };
}
export function writeCatalogState(url: URL, state: CatalogState): URL {
  const next = new URL(url);
  for (const key of ["q", "tag", "kind", "category", "version", "sort"]) next.searchParams.delete(key);
  const parsed = parseSearch(state.search);
  if (parsed.query) next.searchParams.set("q", parsed.query);
  for (const tag of parsed.tags) next.searchParams.append("tag", tag);
  if (state.kind === "template") next.searchParams.set("kind", state.kind);
  if (state.kind === "template" && state.category !== "全部" && state.category) next.searchParams.set("category", state.category);
  if (state.version) next.searchParams.set("version", state.version);
  if (state.sort) next.searchParams.set("sort", state.sort);
  return next;
}
