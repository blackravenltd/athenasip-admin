import { useCallback, useEffect, useRef, useState } from 'react';
import { isAbort } from '../api/errors';

export interface RefreshableAsyncState<T> {
  value?: T;
  error?: Error;
  loading: boolean;
  refreshing: boolean;
  refresh: () => void;
}

/**
 * Page-owned loading that keeps the last usable value across a refresh.
 *
 * The distinction between `loading` and `refreshing` is the point. A first
 * load has nothing to show, so it shows a spinner. A refresh already has a
 * list on screen, and replacing it with a spinner to fetch the same list back
 * is how a page that is working looks broken. So `value` survives, and only
 * `refreshing` changes.
 *
 * An abort is not a failure. Every request here is cancelled on unmount and
 * superseded on refresh, and reporting those as errors is how a page that
 * navigated away leaves a red banner behind it.
 */
export function useRefreshableAsync<T>(
  factory: (signal: AbortSignal) => Promise<T>,
  dependencies: readonly unknown[],
): RefreshableAsyncState<T> {
  const factoryRef = useRef(factory);
  factoryRef.current = factory;
  const activeRef = useRef<{ id: number; controller: AbortController } | undefined>(undefined);
  const nextIdRef = useRef(0);
  const [state, setState] = useState<Omit<RefreshableAsyncState<T>, 'refresh'>>({ loading: true, refreshing: false });

  const load = useCallback((refreshing: boolean) => {
    activeRef.current?.controller.abort(new DOMException('Refresh superseded', 'AbortError'));
    const controller = new AbortController();
    const id = ++nextIdRef.current;
    activeRef.current = { id, controller };
    setState((current) => (refreshing
      ? { ...current, error: undefined, loading: false, refreshing: true }
      : { loading: true, refreshing: false }));

    void factoryRef.current(controller.signal).then((value) => {
      if (controller.signal.aborted || activeRef.current?.id !== id) return;
      setState({ value, loading: false, refreshing: false });
    }).catch((cause: unknown) => {
      if (isAbort(cause) || controller.signal.aborted || activeRef.current?.id !== id) return;
      // Normalised here rather than at every render site: a screen should be
      // able to read `error.message` without first proving it has one.
      const error = cause instanceof Error ? cause : new Error(String(cause));
      setState((current) => ({ ...current, error, loading: false, refreshing: false }));
    });
  }, []);

  useEffect(() => {
    load(false);
    return () => activeRef.current?.controller.abort(new DOMException('Async page was replaced', 'AbortError'));
    // The caller explicitly owns the reload boundary.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, dependencies);

  const refresh = useCallback(() => load(true), [load]);
  return { ...state, refresh };
}
