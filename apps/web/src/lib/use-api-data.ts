'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, ApiError } from './api';
import { useAuth } from './auth-context';

/** GET `path` as the logged-in user, re-fetching whenever the session changes. */
export function useApiData<T>(path: string | null) {
  const { user } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    if (!path || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const result = await apiFetch<T>(path);
      setData(result);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong talking to the API.');
      setStatus(err instanceof ApiError ? err.status : null);
    } finally {
      setLoading(false);
    }
  }, [path, user]);

  useEffect(() => {
    // Fetching on mount/path/user change and writing the result into state is
    // the effect's whole job here — there's no external store to subscribe to.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void reload();
  }, [reload]);

  return { data, error, status, loading, reload };
}
