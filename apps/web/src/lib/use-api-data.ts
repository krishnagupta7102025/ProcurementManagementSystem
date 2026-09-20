'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { useUser } from './user-context';

/** GET `path` as the current demo user, re-fetching whenever the user switches. */
export function useApiData<T>(path: string | null) {
  const { user } = useUser();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const result = await apiFetch<T>(path, { userEmail: user.email });
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong talking to the API.');
      setStatus(err instanceof ApiError ? err.status : null);
    } finally {
      setLoading(false);
    }
  }, [path, user.email]);

  useEffect(() => {
    // Fetching on mount/path/user change and writing the result into state is
    // the effect's whole job here — there's no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, error, status, loading, reload };
}
