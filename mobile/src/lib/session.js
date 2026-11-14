// The signed-in parent: their login token, children (brothers and sisters) and
// which child is being viewed. Kept on the phone so the app stays signed in.
import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setToken, setSignedOutHandler } from './api';
import { getItem, setItem, removeItem } from './storage';

const KEY = 'matha-session';
const SessionContext = createContext(null);

export function SessionProvider({ children }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState(null); // { token, phone, children, childId }

  const save = useCallback(async (s) => {
    setSession(s);
    setToken(s?.token || null);
    if (s) await setItem(KEY, JSON.stringify(s)); else await removeItem(KEY);
  }, []);

  const signOut = useCallback(() => save(null), [save]);

  // Restore the login when the app opens, and refresh the list of children
  useEffect(() => {
    setSignedOutHandler(() => save(null));
    (async () => {
      try {
        const raw = await getItem(KEY);
        if (raw) {
          const s = JSON.parse(raw);
          setToken(s.token);
          setSession(s);
          try {
            const me = await api('/me');
            const childId = me.children.some((c) => c.id === s.childId) ? s.childId : me.children[0]?.id ?? null;
            await save({ ...s, phone: me.phone, children: me.children, childId });
          } catch { /* offline: keep the saved list */ }
        }
      } finally {
        setReady(true);
      }
    })();
  }, [save]);

  const signIn = useCallback(async ({ token, phone, children }) => {
    await save({ token, phone, children, childId: children.length === 1 ? children[0].id : null });
  }, [save]);

  const chooseChild = useCallback((childId) => save({ ...session, childId }), [save, session]);

  const child = session?.children?.find((c) => c.id === session.childId) || null;

  return (
    <SessionContext.Provider value={{ ready, session, child, signIn, signOut, chooseChild }}>
      {children}
    </SessionContext.Provider>
  );
}

export const useSession = () => useContext(SessionContext);
