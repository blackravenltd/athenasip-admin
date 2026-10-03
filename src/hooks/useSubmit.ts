import { useCallback, useState } from 'react';
import { errorMessage, isAbort } from '../api/errors';

export interface SubmitState {
  busy: boolean;
  error?: string;
  /** What was thrown, for a form that shows some failures beside a field rather than below the form. */
  failure?: unknown;
  clearError: () => void;
  /** Resolves to true when the call succeeded, so the caller can close a dialogue. */
  run: (action: () => Promise<unknown>) => Promise<boolean>;
}

/**
 * One write, with the busy flag and the error capture every dialogue needs.
 *
 * Every mutation in this client goes through here so that none of them can
 * forget the parts that must not vary: the controls disable while it is in
 * flight, a failure is caught and shown rather than thrown at the console, and
 * the busy flag is cleared on both paths.
 */
export function useSubmit(): SubmitState {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [failure, setFailure] = useState<unknown>();

  const run = useCallback(async (action: () => Promise<unknown>): Promise<boolean> => {
    setBusy(true);
    setError(undefined);
    setFailure(undefined);
    try {
      await action();
      return true;
    } catch (cause) {
      if (!isAbort(cause)) {
        setError(errorMessage(cause));
        setFailure(cause);
      }
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  const clearError = useCallback(() => { setError(undefined); setFailure(undefined); }, []);
  return { busy, error, failure, clearError, run };
}
