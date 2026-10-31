import type { SearchMatch as Match } from "@/lib/search";

export function SearchMatch({ match }: { match: Match }) {
  const pieces = [];
  let position = 0;
  for (const [start, end] of match.ranges) {
    pieces.push(match.text.slice(position, start), <mark key={`${start}-${end}`}>{match.text.slice(start, end)}</mark>);
    position = end;
  }
  pieces.push(match.text.slice(position));
  return <span className="search-match"><small>命中：{match.label}</small><span>{pieces}</span></span>;
}
