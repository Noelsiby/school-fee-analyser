// Load data for the current child; reload with pull-to-refresh.
import { useCallback, useEffect, useState } from 'react';
import { api } from './api';
import { useSession } from './session';

export function useLoad(path) {
  const { child } = useSession();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!child) return;
    setError('');
    try {
      setData(await api(`/children/${child.id}${path}`));
    } catch (e) {
      setError(e.message);
    }
  }, [child, path]);

  useEffect(() => { setData(null); load(); }, [load]);

  const refresh = useCallback(async () => { setRefreshing(true); await load(); setRefreshing(false); }, [load]);
  return { data, error, refreshing, refresh, reload: load };
}
