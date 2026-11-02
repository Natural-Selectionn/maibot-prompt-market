type Props = { label: string; pageIndex: number; hasMore: boolean; loading: boolean; onPage: (pageIndex: number) => void };

export function WorkPagination({ label, pageIndex, hasMore, loading, onPage }: Props) {
  return <nav className="admin-pagination" aria-label={label}>
    <button type="button" className="key" disabled={loading || pageIndex === 0} onClick={() => onPage(pageIndex - 1)}>上一页</button>
    <span aria-live="polite">第 {pageIndex + 1} 页</span>
    <button type="button" className="key" disabled={loading || !hasMore} onClick={() => onPage(pageIndex + 1)}>下一页</button>
  </nav>;
}
