import { useEffect, useState } from 'react';
import { errorMessage } from '../api/errors';

/**
 * A spinner, but only once waiting is worth mentioning.
 *
 * Against a local server most requests finish inside 50ms, and a spinner shown
 * for 50ms is a flash rather than information. The delay means a fast page
 * never flickers and a slow one still explains itself.
 */
export function Loading({ delayMs = 180 }: { delayMs?: number } = {}) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setVisible(true), Math.max(0, delayMs));
    return () => window.clearTimeout(timer);
  }, [delayMs]);

  if (!visible) return null;
  return (
    <div className="loading-overlay" role="status" aria-live="polite" aria-label="Loading">
      <div className="loading-spinner" aria-hidden="true" />
    </div>
  );
}

/** A failure, said in one line, addressed to somebody trying to fix it. */
export function ErrorMessage({ error }: { error: unknown }) {
  return <p className="error-message" role="alert">{errorMessage(error)}</p>;
}

/** Nothing here yet, said as a state rather than as an empty page. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="empty-message">{children}</p>;
}
