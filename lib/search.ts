export function parseSearch(input: string): { query: string; tags: string[] } {
  const words: string[] = [], tags: string[] = [];
  const tokens = input.match(/[#＃]"(?:\\.|[^"\\])*"|[^\s]+/gu) ?? [];
  for (const token of tokens) {
    let tag = "";
    if (/^[#＃]/u.test(token)) {
      if (token[1] === '"') {
        try { tag = JSON.parse(token.slice(1)); } catch { /* Keep incomplete tags searchable as text. */ }
      } else tag = token.slice(1);
    }
    if (tag && tag.length <= 12 && tags.length < 5) {
      if (!tags.some(value => value.toLocaleLowerCase() === tag.toLocaleLowerCase())) tags.push(tag);
    } else words.push(token);
  }
  return { query: words.join(" ").slice(0, 80), tags };
}

export function formatSearch(query: string, tags: string[]): string {
  return [query, ...tags.map(tag => `#${/[\s"\\]/u.test(tag) ? JSON.stringify(tag) : tag}`)].filter(Boolean).join(" ");
}

export const searchTerms = (query: string) => query.trim().slice(0, 80).split(/\s+/u).filter(Boolean).slice(0, 5);
export const escapeLike = (value: string) => value.replace(/[%_\\]/g, "\\$&");
export function searchPattern(term: string): string {
  const characters = Array.from(term).map(escapeLike);
  return `%${characters.join(characters.length <= 8 ? "%" : "")}%`;
}

export type SearchMatch = { label: string; text: string; ranges: [number, number][] };
export function matchRanges(value: string, term: string): [number, number][] {
  const source = value.toLowerCase(), needle = term.toLowerCase();
  const start = source.indexOf(needle);
  if (start >= 0) return [[start, start + needle.length]];
  if (Array.from(term).length > 8) return [];
  const ranges: [number, number][] = [];
  let position = 0;
  for (const character of needle) {
    const index = source.indexOf(character, position);
    if (index < 0) return [];
    ranges.push([index, index + character.length]); position = index + character.length;
  }
  return ranges;
}

// Only return a short, plain-text window. React renders the ranges as <mark>.
export function searchExcerpt(label: string, value: string, terms: string[]): SearchMatch | undefined {
  const all = terms.flatMap(term => matchRanges(value, term)).sort((a, b) => a[0] - b[0]);
  if (!all.length) return;
  let start = Math.max(0, all[0][0] - 28);
  if (start > 0 && /[\uDC00-\uDFFF]/u.test(value[start])) start--;
  let end = Math.min(value.length, start + 140);
  if (end < value.length && /[\uDC00-\uDFFF]/u.test(value[end])) end--;
  const prefix = start ? "…" : "";
  const ranges: [number, number][] = [];
  for (const [a, b] of all) {
    if (a >= end || b <= start) continue;
    const next: [number, number] = [Math.max(a, start) - start + prefix.length, Math.min(b, end) - start + prefix.length];
    const last = ranges.at(-1);
    if (last && next[0] <= last[1]) last[1] = Math.max(last[1], next[1]); else ranges.push(next);
  }
  return { label, text: prefix + value.slice(start, end) + (end < value.length ? "…" : ""), ranges };
}

export type TagCompletion = { query: string; start: number; end: number };
export function tagCompletion(value: string, caret: number, mode: "search" | "publish"): TagCompletion | null {
  if (mode === "publish") {
    const left = value.slice(0, caret), right = value.slice(caret);
    const start = Math.max(left.lastIndexOf(","), left.lastIndexOf("，")) + 1;
    const tail = right.search(/[,，]/u);
    return { query: value.slice(start, caret).trim(), start, end: tail < 0 ? value.length : caret + tail };
  }
  const tokens = value.matchAll(/[#＃]"(?:\\.|[^"\\])*"|[^\s]+/gu);
  for (const token of tokens) {
    const start = token.index, end = start + token[0].length;
    if (caret <= start || caret > end || !/^[#＃]/u.test(token[0])) continue;
    const raw = value.slice(start + 1, caret);
    let query = raw;
    if (raw.startsWith('"')) { try { query = JSON.parse(raw); } catch { query = raw.slice(1); } }
    return { query, start, end };
  }
  return null;
}
export function completeTag(value: string, target: TagCompletion, tag: string, mode: "search" | "publish") {
  const replacement = mode === "search" ? formatSearch("", [tag]) : tag;
  const suffix = value.slice(target.end);
  const insert = replacement + (mode === "publish" ? (suffix ? "" : "，") : (suffix.startsWith(" ") ? "" : " "));
  return { value: value.slice(0, target.start) + insert + suffix, caret: target.start + insert.length };
}
