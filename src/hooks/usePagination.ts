import { useMemo, useState } from 'react';

export interface Pagination<T> {
  page: T[];
  pageIndex: number;
  pageCount: number;
  next: () => void;
  previous: () => void;
}

/**
 * Paging held by the client, because the server does not page yet.
 *
 * Deliberately a separate hook rather than something a screen does inline, so
 * that when `/api/v1/realms` grows `?page=` there is one place that changes and
 * one place that is already tested. The clamp matters: deleting the last record
 * on the last page must land somebody on a page that exists, not on an empty
 * one that reads as data loss.
 */
export function usePagination<T>(items: readonly T[], pageSize: number): Pagination<T> {
  const [requested, setRequested] = useState(0);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));
  const pageIndex = Math.min(requested, pageCount - 1);
  const page = useMemo(
    () => items.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [items, pageIndex, pageSize],
  );

  return {
    page,
    pageIndex,
    pageCount,
    next: () => setRequested(Math.min(pageIndex + 1, pageCount - 1)),
    previous: () => setRequested(Math.max(pageIndex - 1, 0)),
  };
}
